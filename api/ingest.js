export default async function handler(req, res) {
  // 1. Handle testing the URL in the browser
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'FlipIQ ingest endpoint live' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://fasszewcztnqcjaaswcm.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    const body = req.body || {};
    
    // Extract datasetId depending on how Apify wraps the webhook payload
    const datasetId = body.resource?.defaultDatasetId || body.defaultDatasetId || body.datasetId;

    if (!datasetId) {
      return res.status(200).json({ debug: 'No dataset ID found in payload', receivedBody: body });
    }

    // 2. Fetch the data back from Apify
    const apifyRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&limit=200`);
    if (!apifyRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch dataset from Apify' });
    }
    
    const items = await apifyRes.json();

    if (!items || items.length === 0) {
      return res.status(200).json({ message: 'Empty dataset received from Apify' });
    }

    // 3. Map and format the data for your database
    const listings = items
      .filter(item => {
        const priceStr = item.listing_price?.formatted_amount || item.price || '';
        const price = parseFloat(String(priceStr).replace(/[$,]/g, ''));
        return price > 50 && price < 75000;
      })
      .map(item => {
        const priceStr = item.listing_price?.formatted_amount || item.price || '0';
        const price = parseFloat(String(priceStr).replace(/[$,]/g, ''));
        return {
          title: item.marketplace_listing_title || item.title || 'Unknown',
          price: price,
          url: item.listingUrl || item.url || '',
          photo: item.primary_listing_photo?.photo_image_url || item.photo || '',
          location: item.location?.reverse_geocode?.city 
            ? `${item.location.reverse_geocode.city}, ${item.location.reverse_geocode.state}`
            : 'Albany, NY',
          category: 'boats',
          scraped_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };
      });

    if (listings.length === 0) {
      return res.status(200).json({ message: 'No valid boat listings after applying filters' });
    }

    // 4. Send the clean data over to Supabase
    const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(listings)
    });

    if (!supabaseRes.ok) {
      const errText = await supabaseRes.text();
      return res.status(500).json({ error: errText, count: listings.length });
    }

    return res.status(200).json({ message: `Successfully inserted ${listings.length} boat listings!` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
