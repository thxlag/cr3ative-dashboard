import { readdirSync } from 'node:fs';
import path from 'node:path';

export default (client) => {
    const eventsPath = path.join(__dirname, '../listeners');
    const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        import(filePath)
            .then(eventModule => {
                const event = eventModule.default;
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
            })
            .catch(error => {
                console.error(`Failed to load event ${file}: ${error}`);
            });
    }
}
