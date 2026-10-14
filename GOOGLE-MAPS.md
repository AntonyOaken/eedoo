# Google data for Phuket / По пути

Uses Google Places UI Kit Essentials, alongside the existing OSM map. Google content stays in Google components; no HTML scraping, no photo/review catalogue copies, no separate Places fetchFields calls. The route and its markers retain independently sourced coordinates.

## Enable

1. In your Google Cloud project, attach billing and enable Maps JavaScript API and Places UI Kit API.
2. Create a separate browser API key. Set Website/HTTP referrer restriction to https://poputi.dubrovin2ae.chatgpt.site/* and API restrictions to those two APIs. This browser key is intentionally returned to the user's browser. Never use an unrestricted server key.
3. Configure the Site runtime environment variable GOOGLE_MAPS_BROWSER_API_KEY. No rebuild is needed for a runtime key change.
4. Set quotas in Google Cloud to bound paid usage. Budget alerts do not impose a spending cap.
5. Open Phuket, choose По пути, open a POI. Check successful search, selected-place photos/hours/reviews, attribution, and failure behavior.

## Requests and matching

Only the opened card makes a request. Without a saved Google Place ID: one UI Kit search for the catalogue name/alias and Phuket, biased to original coordinates; up to three displayed candidates; user selects one; one details component. Known old catalogue names are used as query aliases, without rewriting source facts.

Save only the selected Place ID in browser storage, and only if the UI Kit candidate is within 250m of our point. Different or moved results may be viewed but aren't remembered as matches. Future openings request fresh details using that ID. The user can clear the match. No factual Google data persists. Requests have timeouts and fall back to labelled catalogue information. Saved IDs can become obsolete: clear/reselect when needed.

## Limits

The integration is inactive until a valid key and billing are available. It does not promise to remove closed stops automatically: UI Kit exposes IDs/locations, and other facts remain in its rendered interface. Google status updates aren't imported into route selection. This is a live information layer, not a full replacement of the OSM catalogue.

Sources: https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started and https://cloud.google.com/maps-platform/terms/maps-service-terms (Places UI Kit exception for other maps).
