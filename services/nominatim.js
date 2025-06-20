const https = require('https');

function geocode(address) {
  return new Promise((resolve, reject) => {
    // Encode the address for URL
    const encodedAddress = encodeURIComponent(address);
    
    // Construct the Nominatim API URL
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;
    
    const options = {
      headers: {
        'User-Agent': 'DisasterResponse/1.0' // Required by Nominatim's usage policy
      }
    };

    const req = https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          
          if (results && results.length > 0) {
            const location = results[0];
            resolve({
              latitude: parseFloat(location.lat),
              longitude: parseFloat(location.lon),
              display_name: location.display_name
            });
          } else {
            reject(new Error('Location not found'));
          }
        } catch (error) {
          reject(new Error('Failed to parse Nominatim response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Nominatim request failed: ${error.message}`));
    });

    req.end();
  });
}

module.exports = {
  geocode
}; 