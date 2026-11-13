export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return Response.json({ applinks: { details: [] } });
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [team + ".com.offerme.marketplace"],
          components: [{ "/": "/items/*" }],
        },
      ],
    },
  });
}
