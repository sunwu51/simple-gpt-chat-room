let apiUrl = '';
let apiToken = '';
let model = '';
let systemPrompt = '';
let conversationHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    const saveConfigBtn = document.getElementById('saveConfig');
    const sendMessageBtn = document.getElementById('sendMessage');
    const clearChatBtn = document.getElementById('clearChat');
    const userInput = document.getElementById('userInput');
    const chatMessages = document.getElementById('chatMessages');

    saveConfigBtn.addEventListener('click', saveConfiguration);
    sendMessageBtn.addEventListener('click', sendMessage);
    clearChatBtn.addEventListener('click', clearChat);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Load saved configuration
    apiUrl = localStorage.getItem('apiUrl') || '';
    apiToken = localStorage.getItem('apiToken') || '';
    model = localStorage.getItem('model') || 'gpt-3.5-turbo';
    systemPrompt = localStorage.getItem('systemPrompt') || '';
    document.getElementById('apiUrl').value = apiUrl;
    document.getElementById('apiToken').value = apiToken;
    document.getElementById('model').value = model;
    document.getElementById('systemPrompt').value = systemPrompt;

    // Configure marked to use Prism for syntax highlighting
    marked.setOptions({
        highlight: function(code, lang) {
            if (Prism.languages[lang]) {
                return Prism.highlight(code, Prism.languages[lang], lang);
            } else {
                return code;
            }
        }
    });
});

function saveConfiguration() {
    apiUrl = document.getElementById('apiUrl').value.trim();
    apiToken = document.getElementById('apiToken').value.trim();
    model = document.getElementById('model').value.trim();
    systemPrompt = document.getElementById('systemPrompt').value.trim();
    
    if (apiUrl && apiToken && model) {
        localStorage.setItem('apiUrl', apiUrl);
        localStorage.setItem('apiToken', apiToken);
        localStorage.setItem('model', model);
        localStorage.setItem('systemPrompt', systemPrompt);
        alert('Configuration saved successfully!');
    } else {
        alert('Please enter API URL, API Token, and Model.');
    }
}

async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (!message) return;

    // 添加用户消息到历史记录
    addMessageToChat('user', message, true);
    userInput.value = '';

    if (!apiUrl || !apiToken || !model) {
        addMessageToChat('gpt', 'Please configure the API URL, API Token, and Model first.', true);
        return;
    }

    try {
        const contextMessages = conversationHistory.slice(-12).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        // Add system prompt as the first message if it exists
        if (systemPrompt) {
            contextMessages.unshift({ role: "system", content: systemPrompt });
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify({
                model: model,
                messages: contextMessages,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        await handleStreamingResponse(response);
    } catch (error) {
        console.error('Error:', error);
        addMessageToChat('gpt', 'Sorry, there was an error processing your request.', true);
    }
}

async function handleStreamingResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let messageElement = null;
    let fullMessage = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                    // 在流式响应完成后，将完整的消息添加到历史记录
                    if (fullMessage) {
                        addMessageToHistory('gpt', fullMessage);
                    }
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0].delta.content;
                    if (content) {
                        if (!messageElement) {
                            messageElement = addMessageToChat('gpt', '', false);
                        }
                        fullMessage += content;
                        updateMessageContent(messageElement, fullMessage);
                    }
                } catch (error) {
                    console.error('Error parsing streaming data:', error);
                }
            }
        }
    }
}

function addMessageToChat(sender, message, addToHistory = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    
    if (sender === 'gpt') {
        messageElement.innerHTML = marked.parse(message);
    } else {
        messageElement.textContent = message;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 只有在指定时才添加到历史记录
    if (addToHistory) {
        addMessageToHistory(sender, message);
    }

    return messageElement;
}

function addMessageToHistory(sender, message) {
    conversationHistory.push({ sender, content: message });
    // Keep only the last 13 messages (6 pairs plus the current message)
    if (conversationHistory.length > 13) {
        conversationHistory = conversationHistory.slice(-13);
    }
}

function updateMessageContent(messageElement, newContent) {
    messageElement.innerHTML = marked.parse(newContent);
    
    // Apply syntax highlighting to code blocks
    messageElement.querySelectorAll('pre code').forEach((block) => {
        Prism.highlightElement(block);
    });

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    conversationHistory = [];
}
