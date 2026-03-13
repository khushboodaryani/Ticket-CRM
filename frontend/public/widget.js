(function() {
    // 1. Configuration
    const BACKEND_URL = 'http://localhost:8450';
    const WIDGET_ID = 'ticket-crm-chat-widget';

    // 2. Load Socket.io from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    script.onload = () => initWidget();
    document.head.appendChild(script);

    function initWidget() {
        // Create widget container
        const container = document.createElement('div');
        container.id = WIDGET_ID;
        document.body.appendChild(container);

        // Inject Styles
        const style = document.createElement('style');
        style.textContent = `
            #${WIDGET_ID} {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .chat-bubble {
                width: 60px;
                height: 60px;
                background: #2563eb;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 8px 32px rgba(37, 99, 235, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .chat-bubble:hover { transform: scale(1.1) rotate(5deg); }
            .chat-window {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 380px;
                height: 550px;
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.4);
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                display: none;
                flex-direction: column;
                overflow: hidden;
                transform: translateY(20px);
                opacity: 0;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .chat-window.open { 
                display: flex; 
                transform: translateY(0);
                opacity: 1;
            }
            .chat-header {
                padding: 20px;
                background: linear-gradient(135deg, #2563eb, #1e40af);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chat-header h3 { margin: 0; font-size: 16px; font-weight: 700; }
            .close-btn { cursor: pointer; opacity: 0.8; transition: opacity 0.2s; }
            .close-btn:hover { opacity: 1; }
            
            .chat-messages {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: rgba(248, 250, 252, 0.5);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .msg {
                padding: 10px 14px;
                border-radius: 12px;
                max-width: 80%;
                font-size: 14px;
                line-height: 1.4;
                box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            }
            .msg.out { 
                background: #2563eb; 
                color: white;
                align-self: flex-end; 
                border-bottom-right-radius: 4px;
            }
            .msg.in { 
                background: white; 
                color: #1e293b;
                align-self: flex-start; 
                border-bottom-left-radius: 4px;
                border: 1px solid rgba(0,0,0,0.05);
            }
            .chat-input-area {
                padding: 16px;
                background: white;
                border-top: 1px solid rgba(0,0,0,0.05);
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .chat-input {
                flex: 1;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 10px 14px;
                outline: none;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            .chat-input:focus { border-color: #2563eb; }
            .send-btn {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 10px 16px;
                cursor: pointer;
                font-weight: 600;
                transition: background 0.2s;
            }
            .send-btn:hover { background: #1e40af; }
        `;
        document.head.appendChild(style);

        // Build UI
        container.innerHTML = `
            <div class="chat-window">
                <div class="chat-header">
                    <h3>Support Chat</h3>
                    <div class="close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </div>
                </div>
                <div class="chat-messages" id="chat-msgs">
                    <div class="msg in">Hello! 👋 How can we help you today?</div>
                </div>
                <form class="chat-input-area" id="chat-form">
                    <input type="text" class="chat-input" id="chat-inp" placeholder="Type a message..." required>
                    <button type="submit" class="send-btn">Send</button>
                </form>
            </div>
            <div class="chat-bubble">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
        `;

        const bubble = container.querySelector('.chat-bubble');
        const window = container.querySelector('.chat-window');
        const closeBtn = container.querySelector('.close-btn');
        const form = container.querySelector('#chat-form');
        const input = container.querySelector('#chat-inp');
        const msgs = container.querySelector('#chat-msgs');

        bubble.onclick = () => window.classList.add('open');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            window.classList.remove('open');
        };

        // Socket logic
        const socket = io(BACKEND_URL);
        const guestId = localStorage.getItem('chat_guest_id') || `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('chat_guest_id', guestId);

        socket.on('connect', () => {
            console.log('Connected to support server');
            socket.emit('join', guestId); // Join a room for targeted replies
        });

        form.onsubmit = (e) => {
            e.preventDefault();
            const text = input.value;
            if (!text) return;

            // Update UI immediately (Visitor Message)
            appendMsg(text, 'out'); 
            
            // Send to backend
            socket.emit('guest_message', {
                senderId: guestId,
                senderName: 'Web Visitor',
                body: text
            });

            input.value = '';
        };

        socket.on('message_received', (data) => {
            console.log('Message confirmed by server');
        });

        // Listen for agent replies
        socket.on('agent_reply', (data) => {
            appendMsg(data.message, 'in'); 
        });

        function appendMsg(text, type) {
            const div = document.createElement('div');
            div.className = `msg ${type}`;
            div.textContent = text;
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;
        }
    }
})();
