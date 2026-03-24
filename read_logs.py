with open(r'c:\Users\DELL\Desktop\Ticket_CRM\backend\logs\app.log', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    with open(r'c:\Users\DELL\Desktop\Ticket_CRM\backend\logs\tail_trace.txt', 'w', encoding='utf-8') as f2:
        for line in lines[-100:]:
            f2.write(line)
print("Saved tail to tail_trace.txt")
