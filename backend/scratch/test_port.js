// scratch/test_port.js
import net from 'net';

const host = '181.214.10.214';
const port = 3306;

const client = new net.Socket();
client.setTimeout(2000);

client.on('connect', () => {
    console.log(`Port ${port} is OPEN on ${host}`);
    client.destroy();
});

client.on('error', (err) => {
    console.log(`Port ${port} is CLOSED or UNREACHABLE: ${err.message}`);
});

client.on('timeout', () => {
    console.log(`Port ${port} connection TIMED OUT`);
    client.destroy();
});

client.connect(port, host);
