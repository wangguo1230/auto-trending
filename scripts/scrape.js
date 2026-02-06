import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_TOKEN = process.env.GH_TOKEN;

async function fetchRepoDetails(owner, repo) {
  if (!GH_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchReadmeSummary(owner, repo) {
  if (!GH_TOKEN) return '';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { 
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.raw'
      }
    });
    if (!res.ok) return '';
    const text = await res.text();
    // Get first paragraph that isn't a badge or title
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('![') && !l.startsWith('#') && !l.startsWith('[!'));
    return lines.slice(0, 2).join(' ').slice(0, 200);
  } catch (e) {
    return '';
  }
}

(async () => {
  console.log('Starting scrape...');
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // 1. Scrape the list (Names & URLs)
  await page.goto('https://github.com/trending?since=daily', { waitUntil: 'networkidle2' });
  const basicRepos = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('article.Box-row')).map(row => {
      const link = row.querySelector('h2 a');
      const href = link ? link.getAttribute('href') : '';
      const [_, owner, name] = href.split('/');
      return { owner, name, url: `https://github.com${href}` };
    });
  });
  await browser.close();

  console.log(`Found ${basicRepos.length} repos. Enriching with API...`);

  // 2. Enrich with API
  const finalRepos = [];
  for (const repo of basicRepos) {
    let details = await fetchRepoDetails(repo.owner, repo.name);
    let summary = '';
    
    // Fallback if API fails or no desc
    if (!details || !details.description) {
        summary = await fetchReadmeSummary(repo.owner, repo.name);
    }

    finalRepos.push({
      name: `${repo.owner}/${repo.name}`,
      url: repo.url,
      desc: details?.description || summary || '暂无描述',
      lang: details?.language || 'Unknown',
      stars: details ? `${details.stargazers_count} stars` : 'Unknown stars',
      topics: details?.topics || []
    });
    
    // Tiny delay to be safe
    await new Promise(r => setTimeout(r, 200));
  }

  const outputPath = path.join(__dirname, '../public/data.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalRepos, null, 2));
  console.log('Done!');
})();
