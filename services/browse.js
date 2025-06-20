const axios = require('axios');
const cheerio = require('cheerio');

// Example: Fetch FEMA news headlines
async function fetchFemaUpdates() {
  const url = 'https://www.fema.gov/press-releases';
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const updates = [];
  $('.views-row').each((i, el) => {
    const title = $(el).find('.card__title').text().trim();
    const link = 'https://www.fema.gov' + $(el).find('a').attr('href');
    const date = $(el).find('.datetime').text().trim();
    if (title && link) {
      updates.push({ title, link, date });
    }
  });
  return updates;
}

// Example: Fetch Red Cross news headlines
async function fetchRedCrossUpdates() {
  const url = 'https://www.redcross.org/about-us/news-and-events/news.html';
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const updates = [];
  $('.m-card--news').each((i, el) => {
    const title = $(el).find('.m-card--news__title').text().trim();
    const link = 'https://www.redcross.org' + $(el).find('a').attr('href');
    const date = $(el).find('.m-card--news__date').text().trim();
    if (title && link) {
      updates.push({ title, link, date });
    }
  });
  return updates;
}

async function fetchAllOfficialUpdates() {
  const [fema, redcross] = await Promise.all([
    fetchFemaUpdates(),
    fetchRedCrossUpdates()
  ]);
  return { fema, redcross };
}

module.exports = {
  fetchFemaUpdates,
  fetchRedCrossUpdates,
  fetchAllOfficialUpdates
}; 