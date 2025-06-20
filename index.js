require("dotenv").config();
const express = require("express");
const { extractLocation } = require("./services/gemini");
const { geocode } = require("./services/nominatim");
const {
  createDisaster,
  getResourcesNearby,
  getDisasters,
  createResource,
} = require("./services/supabase");
const { verifyImage } = require("./services/gemini");
const { fetchAllOfficialUpdates } = require("./services/browse");
const http = require("http");
const socketIo = require("socket.io");
const multer = require('multer');
const upload = multer();
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });
const { logAction } = require("./services/logger");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock authentication middleware
const mockUsers = {
  netrunnerX: { role: "admin" },
  reliefAdmin: { role: "admin" },
  citizen1: { role: "contributor" },
  helperNY: { role: "contributor" },
};

app.use((req, res, next) => {
  // Accept user from header or query param
  const user = req.headers["x-mock-user"] || req.query.user;
  if (user && mockUsers[user]) {
    req.user = { username: user, ...mockUsers[user] };
  } else {
    req.user = { username: "guest", role: "guest" };
  }
  next();
});

// Basic route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Disaster Response API",
    status: "operational",
  });
});

// Geocode endpoint
app.post("/geocode", async (req, res) => {
  const { text } = req.body;

  // Validate request body
  if (!text) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Text content is required in the request body",
    });
  }

  try {
    // Step 1: Extract location using Gemini AI
    const extractedLocation = await extractLocation(text);
    console.log("extractedLocation", extractedLocation);

    // Step 2: Get coordinates using Nominatim
    const locationData = await geocode(extractedLocation);

    res.json({
      success: true,
      data: {
        original_text: text,
        extracted_location: extractedLocation,
        coordinates: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        },
        formatted_address: locationData.display_name,
      },
    });
  } catch (error) {
    console.error("Error processing geocode request:", error);

    // Determine appropriate error response
    const status = error.message.includes("No location found")
      ? 404
      : error.message.includes("Location not found")
      ? 404
      : 500;

    res.status(status).json({
      error: status === 404 ? "Not Found" : "Internal Server Error",
      message: error.message,
    });
  }
});

// Create a disaster (example endpoint)
app.post("/disasters", async (req, res) => {
  try {
    const { title, location_name, description, tags, owner_id } = req.body;
    if (!title || !location_name) {
      return res
        .status(400)
        .json({ error: "title and location_name are required" });
    }
    console.log("req.body:", req.body);

    // Geocode the location_name to get coordinates
    const locationData = await geocode(location_name);
    console.log("locationData:", locationData);
    // Prepare audit trail entry
    const auditEntry = {
      action: "create",
      user_id: req.user.username,
      timestamp: new Date().toISOString(),
    };
    // Prepare location as PostGIS geography string
    const location = `SRID=4326;POINT(${locationData.longitude} ${locationData.latitude})`;

    const disaster = await createDisaster({
      title,
      location_name,
      location,
      description,
      tags,
      owner_id: owner_id || req.user.username, // Default to authenticated user
      audit_trail: [auditEntry],
    });
    console.log("disaster:", disaster);

    logAction("disaster_created", { id: disaster.id, user: req.user.username });
    io.emit("disaster_updated", disaster);

    res.status(201).json({ success: true, data: disaster });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Geospatial lookup for resources of a disaster
app.get("/disasters/:id/resources", async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lon, radius } = req.query;
    if (!lat || !lon) {
      return res
        .status(400)
        .json({ error: "lat and lon query parameters are required" });
    }
    const searchRadius = radius ? parseFloat(radius) : 10000; // default 10km
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    // Get all resources near the point
    const allNearby = await getResourcesNearby({
      longitude,
      latitude,
      radius: searchRadius,
    });
    // Filter for this disaster
    const filtered = allNearby.filter((r) => r.disaster_id === id);
    // Optionally, sort by distance if available
    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Create a resource for a disaster
app.post("/disasters/:id/resources", async (req, res) => {
  try {
    const { id: disaster_id } = req.params;
    const { name, location_name, type } = req.body;

    if (!name || !location_name || !type) {
      return res
        .status(400)
        .json({ error: "name, location_name, and type are required" });
    }

    // Geocode the location_name to get coordinates
    const locationData = await geocode(location_name);

    // Prepare location as PostGIS geography string
    const location = `SRID=4326;POINT(${locationData.longitude} ${locationData.latitude})`;

    const resource = await createResource({
      disaster_id,
      name,
      location_name,
      location,
      type,
    });

    logAction("resource_created", { id: resource.id, user: req.user.username });
    io.emit("resources_updated", { disaster_id });

    res.status(201).json({ success: true, data: resource });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Image verification endpoint
app.post("/disasters/:id/verify-image", upload.single('image'), async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: "image file is required in the request" });
      }
      // Convert buffer to base64
      const image_base64 = req.file.buffer.toString('base64');
      const result = await verifyImage(image_base64);
      res.json({ success: true, disaster_id: id, verification: result });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

// Browse Page: Fetch official updates from FEMA and Red Cross
app.get("/browse/updates", async (req, res) => {
  try {
    const updates = await fetchAllOfficialUpdates();
    res.json({ success: true, data: updates });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Mock social media endpoint
app.get("/disasters/:id/social-media", (req, res) => {
  // Mock data simulating social media posts
  const mockPosts = [
    {
      post: "#floodrelief Need food in NYC",
      user: "citizen1",
      timestamp: "2024-06-17T12:00:00Z",
    },
    {
      post: "Offering shelter in Brooklyn #floodrelief",
      user: "helperNY",
      timestamp: "2024-06-17T12:05:00Z",
    },
    {
      post: "Power outage in Lower Manhattan #nycdisaster",
      user: "nycwatch",
      timestamp: "2024-06-17T12:10:00Z",
    },
    {
      post: "Need medical supplies #floodrelief",
      user: "medicNY",
      timestamp: "2024-06-17T12:15:00Z",
    },
    {
      post: "Volunteers needed at Central Park #floodrelief",
      user: "volunteerNY",
      timestamp: "2024-06-17T12:20:00Z",
    },
  ];
  res.json({ success: true, data: mockPosts });
});

// Update disaster
app.put("/disasters/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, location_name, longitude, latitude, description, tags } =
      req.body;
    // Fetch existing disaster
    const disasters = await getDisasters({ id });
    if (!disasters.length)
      return res.status(404).json({ error: "Disaster not found" });
    const disaster = disasters[0];
    // Prepare audit trail entry
    const auditEntry = {
      action: "update",
      user_id: req.user.username,
      timestamp: new Date().toISOString(),
    };
    // Prepare location as PostGIS geography string
    const location =
      longitude && latitude
        ? `SRID=4326;POINT(${longitude} ${latitude})`
        : disaster.location;
    // Update disaster
    const { data, error } = await require("./services/supabase")
      .supabase.from("disasters")
      .update({
        title: title || disaster.title,
        location_name: location_name || disaster.location_name,
        location,
        description: description || disaster.description,
        tags: tags || disaster.tags,
        audit_trail: [...(disaster.audit_trail || []), auditEntry],
      })
      .eq("id", id)
      .select();
    if (error) throw error;
    logAction("disaster_updated", { id, user: req.user.username });
    io.emit("disaster_updated", { id });
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Delete disaster
app.delete("/disasters/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch existing disaster
    const disasters = await getDisasters({ id });
    if (!disasters.length)
      return res.status(404).json({ error: "Disaster not found" });
    const disaster = disasters[0];
    // Prepare audit trail entry
    const auditEntry = {
      action: "delete",
      user_id: req.user.username,
      timestamp: new Date().toISOString(),
    };
    // Update audit trail before delete
    await require("./services/supabase")
      .supabase.from("disasters")
      .update({ audit_trail: [...(disaster.audit_trail || []), auditEntry] })
      .eq("id", id);
    // Delete disaster
    const { error } = await require("./services/supabase")
      .supabase.from("disasters")
      .delete()
      .eq("id", id);
    if (error) throw error;
    logAction("disaster_deleted", { id, user: req.user.username });
    io.emit("disaster_updated", { id });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Official updates for a disaster (reuse browse logic, add caching)
app.get("/disasters/:id/official-updates", async (req, res) => {
  try {
    const cacheKey = `browse:official-updates`;
    const { getCache, setCache } = require("./services/supabase");
    let cached;
    try {
      cached = await getCache(cacheKey);
      if (
        cached &&
        cached.value &&
        cached.expires_at > new Date().toISOString()
      ) {
        logAction("official_updates_cache_hit", { disaster_id: req.params.id });
        return res.json({ success: true, data: cached.value, cached: true });
      }
    } catch (e) {
      /* cache miss */
    }
    const updates =
      await require("./services/browse").fetchAllOfficialUpdates();
    const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await setCache(cacheKey, updates, expires_at);
    logAction("official_updates_fetched", { disaster_id: req.params.id });
    res.json({ success: true, data: updates, cached: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message,
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Export io for use in endpoints
module.exports = { io };
