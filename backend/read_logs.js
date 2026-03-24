import fs from 'fs';

const logPath = 'logs/app.log';
if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    const lastLines = lines.slice(-200).join('\n');
    fs.writeFileSync('output_logs.txt', lastLines);
} else {
    fs.writeFileSync('output_logs.txt', 'No log file found');
}
process.exit(0);
