export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = 'https://fasszewcztnqcjaaswcm.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    const body = req.body;
    
    // Apify sends a webhook payload with a resource object
    // The actual data is fetched from Apify's dataset
    const datasetId = body?.resource?.defaultDatasetId;
    
    if (!datasetId) {
      return res.status(400).json({ error: 'No dataset ID found', body });
    }

    // Fetch the actual scraped items from Apify
    const apifyRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`
    );
    const items = await apifyRes.json();

    if (!items || items.length === 0) {
      return res.status(200).json({ message: 'No items in dataset' });
    }

    const listings = items
      .filter(item => {
        const priceStr = item.listing_price?.formatted_amount || 
                        item.price || '';
        const price = parseFloat(String(priceStr).replace(/[$,]/g, ''));
        return price > 50 && price < 75000;
      })
      .map(item => {
        const priceStr = item.listing_price?.formatted_amount || 
                        item.price || '0';
        const price = parseFloat(String(priceStr).replace(/[$,]/g, ''));
        return {
          title: item.marketplace_listing_title || item.title || 'Unknown',
          price,
          url: item.listingUrl || item.url || '',
          photo: item.primary_listing_photo?.photo_image_url || 
                 item.photo || '',
          location: item.location?.reverse_geocode?.city
            ? `${item.location.reverse_geocode.city}, ${item.location.reverse_geocode.state}`
            : 'Albany, NY',
          category: 'boats',
          scraped_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        };
      });

    if (listings.length === 0) {
      return res.status(200).json({ message: 'No valid listings after filtering' });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(listings),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    return res.status(200).json({ 
      message: `Inserted ${listings.length} listings successfully` 
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
