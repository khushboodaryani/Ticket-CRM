with open(r'c:\Users\DELL\Desktop\Ticket_CRM\backend\logs\app.log', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    with open(r'c:\Users\DELL\Desktop\Ticket_CRM\backend\logs\tail.txt', 'w', encoding='utf-8') as f2:
        for line in lines[-20:]:
            f2.write(line)
print("Saved tail to tail.txt")
