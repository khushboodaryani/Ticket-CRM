with open(r'c:\Users\DELL\Desktop\Ticket_CRM\backend\logs\app.log', 'r', encoding='utf-8') as f:
    for line in f:
        if '2026-03-23' in line and '[EmailPoller]' in line:
            print(line.strip())
