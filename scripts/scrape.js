const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Go to GitHub Trending
  await page.goto('https://github.com/trending?since=daily', { waitUntil: 'networkidle2' });

  // Extract Data
  const repos = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('article.Box-row'));
    return rows.map(row => {
      const link = row.querySelector('h2 a');
      const desc = row.querySelector('p');
      const starsToday = row.querySelector('span.d-inline-block.float-sm-right');
      const lang = row.querySelector('[itemprop="programmingLanguage"]');
      
      return {
        name: link ? link.innerText.trim().replace(/\s+/g, '') : 'Unknown',
        url: link ? link.href : '',
        desc: desc ? desc.innerText.trim() : 'No description',
        lang: lang ? lang.innerText.trim() : 'Unknown',
        stars: starsToday ? starsToday.innerText.trim() : ''
      };
    });
  });

  await browser.close();

  // Save to public/data.json
  const outputPath = path.join(__dirname, '../public/data.json');
  fs.writeFileSync(outputPath, JSON.stringify(repos, null, 2));
  console.log(`Scraped ${repos.length} repositories.`);
})();
