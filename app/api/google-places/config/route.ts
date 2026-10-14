export function GET(){const apiKey=process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim();return Response.json(apiKey?{enabled:true,apiKey}:{enabled:false},{headers:{'Cache-Control':'no-store'}});}
