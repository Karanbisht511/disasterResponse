const https = require('https');

async function extractLocation(text) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      reject(new Error('GEMINI_API_KEY is not set in environment variables'));
      return;
    }

    const data = JSON.stringify({
      contents: [{
        parts: [{
          text: `Identify and extract location name mentioned in the following disaster-related report. Return only the name of place (e.g., cities, states, countries, or landmarks) associated with the disaster: "${text}" output should be one word`
        }]
      }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          
          if (response.error) {
            reject(new Error(response.error.message || 'Gemini API error'));
            return;
          }

          if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
            reject(new Error('Invalid response format from Gemini API'));
            return;
          }

          const extractedLocation = response.candidates[0].content.parts[0].text.trim();
          
          if (!extractedLocation || extractedLocation.toLowerCase() === 'no location found') {
            reject(new Error('No location found in the provided text'));
            return;
          }

          resolve(extractedLocation);
        } catch (error) {
          reject(new Error(`Failed to parse Gemini API response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Gemini API request failed: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

async function verifyImage(base64Image) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      reject(new Error('GEMINI_API_KEY is not set in environment variables'));
      return;
    }

    const data = JSON.stringify({
      contents: [{
        parts: [
          {
            text: 'Analyze this image for authenticity. Is it manipulated, AI-generated, or does it match a real disaster context? Give a short explanation.'
          },
          {
            inline_data: {
              mime_type: 'image/jpeg', // or image/png, depending on input
              data: base64Image
            }
          }
        ]
      }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-pro-vision:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (response.error) {
            reject(new Error(response.error.message || 'Gemini API error'));
            return;
          }
          if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
            reject(new Error('Invalid response format from Gemini API'));
            return;
          }
          const resultText = response.candidates[0].content.parts[0].text.trim();
          resolve(resultText);
        } catch (error) {
          reject(new Error(`Failed to parse Gemini API response: ${error.message}`));
        }
      });
    });
    req.on('error', (error) => {
      reject(new Error(`Gemini API request failed: ${error.message}`));
    });
    req.write(data);
    req.end();
  });
}

module.exports = {
  extractLocation,
  verifyImage
}; 