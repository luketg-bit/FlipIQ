module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'live' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const datasetId = (body.resource && body.resource.defaultDatasetId) || body.defaultDatasetId;

    if (!datasetId) {
      return res.status(200).json({ debug: 'no dataset id', body: body });
    }

    const apifyRes = await fetch('https://api.apify.com/v2/datasets/' + datasetId + '/items?clean=true&format=json&limit=200');
    const items = await apifyRes.json();

    if (!items || !items.length) {
      return res.status(200).json({ message: 'empty dataset', datasetId: datasetId });
    }

    const listings = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var priceStr = '';
      if (item.listing_price && item.listing_price.formatted_amount) {
        priceStr = item.listing_price.formatted_amount;
      } else if (item.price) {
        priceStr = String(item.price);
      }
      var price = parseFloat(priceStr.replace(/[$,]/g, ''));
      if (price > 50 && price < 75000) {
        var city = 'Albany, NY';
        if (item.location && item.location.reverse_geocode && item.location.reverse_geocode.city) {
          city = item.location.reverse_geocode.city + ', ' + item.location.reverse_geocode.state;
        }
        listings.push({
          title: item.marketplace_listing_title || item.title || 'Unknown',
          price: price,
          url: item.listingUrl || item.url || '',
          photo: (item.primary_listing_photo && item.primary_listing_photo.photo_image_url) || '',
          location: city,
          category: 'boats',
          scraped_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        });
      }
    }

    if (!listings.length) {
      return res.status(200).json({ message: 'no valid listings after filter' });
    }

    var supabaseRes = await fetch('https://fasszewcztnqcjaaswcm.supabase.co/rest/v1/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(listings)
    });

    if (!supabaseRes.ok) {
      var err = await supabaseRes.text();
      return res.status(500).json({ error: err, count: listings.length });
    }

    return res.status(200).json({ message: 'inserted ' + listings.length + ' listings' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
