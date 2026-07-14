# Google Search Console Setup — FloStudio: AI Social Media

This guide configures **https://flostudio.vercel.app** for Google Search Console and ongoing organic-search monitoring.

## 1. Verify the site

Open [Google Search Console](https://search.google.com/search-console/about), choose **Add property**, and add `https://flostudio.vercel.app`. Prefer a **Domain property** when DNS access is available; otherwise use a URL-prefix property. For DNS verification, copy Google's TXT value into the domain's DNS settings, wait for propagation, and select **Verify**.

## 2. Submit the sitemap

After verification, open **Indexing → Sitemaps**, enter `https://flostudio.vercel.app/sitemap.xml`, and submit it. Confirm that the sitemap status becomes **Success**. Then inspect the homepage URL and request indexing after each material landing-page update.

## 3. Monitor indexing and rankings

Use **Performance → Search results** to review clicks, impressions, click-through rate, and average position. Filter by page and query to compare performance against the target keywords in `SEO_KEYWORDS.md`. Review **Indexing → Pages** monthly for excluded or failed URLs, and check **Experience → Core Web Vitals** after new releases.

## 4. Recommended cadence

Review Search Console weekly for the first eight weeks, record ranking movement for primary and buyer-intent queries, refresh underperforming landing copy, and publish the three drafts in `content/blog/` as indexable HTML pages before submitting those URLs for indexing.
