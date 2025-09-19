// ... existing code (imports, express app setup) ...

app.get('/api/admin/guilds', async (req, res) => {
  console.log('GET /api/admin/guilds'); // Add this line
  try {
    // ... existing code (fetch guild data) ...
    console.log('Guild data:', guildData); // Add this line
    res.json(guildData); // Modify this line
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// ... other API routes ...

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
