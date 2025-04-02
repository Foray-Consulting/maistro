const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * Manages chat conversations and messages
 */
class ChatManager {
  /**
   * Constructor
   * @param {string} dataDir - Data directory path
   */
  constructor(dataDir) {
    this.chatsDir = path.join(dataDir, 'chats');
    this.chatsFile = path.join(this.chatsDir, 'chats.json');
    fs.ensureDirSync(this.chatsDir);
    
    // Initialize chats data
    try {
      if (fs.existsSync(this.chatsFile)) {
        this.chats = JSON.parse(fs.readFileSync(this.chatsFile, 'utf8'));
      } else {
        this.chats = [];
        fs.writeFileSync(this.chatsFile, JSON.stringify(this.chats, null, 2));
      }
    } catch (error) {
      console.error('Error initializing chats data:', error);
      this.chats = [];
      // Create the file if it doesn't exist
      fs.writeFileSync(this.chatsFile, JSON.stringify(this.chats, null, 2));
    }
  }

  /**
   * Get all chats
   * @returns {Array} List of chats
   */
  getAllChats() {
    // Sort chats by updatedAt (newest first)
    return this.chats.sort((a, b) => {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  /**
   * Get a chat by ID
   * @param {string} id - Chat ID
   * @returns {Object} Chat object
   */
  getChatById(id) {
    return this.chats.find(chat => chat.id === id);
  }

  /**
   * Create a new chat
   * @param {string} name - Chat name
   * @returns {Object} Created chat
   */
  createChat(name) {
    const id = `chat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    
    const chat = {
      id,
      name,
      messages: [],
      createdAt: now,
      updatedAt: now,
      preview: ''
    };
    
    this.chats.push(chat);
    this._saveChats();
    
    return chat;
  }

  /**
   * Update a chat's name
   * @param {string} id - Chat ID
   * @param {string} name - New name
   * @returns {Object} Updated chat
   */
  updateChatName(id, name) {
    const chat = this.getChatById(id);
    if (!chat) throw new Error(`Chat with ID ${id} not found`);
    
    chat.name = name;
    chat.updatedAt = new Date().toISOString();
    
    this._saveChats();
    return chat;
  }

  /**
   * Add a message to a chat
   * @param {string} chatId - Chat ID
   * @param {Object} message - Message object
   * @returns {Object} Added message with ID
   */
  addMessage(chatId, message) {
    const chat = this.getChatById(chatId);
    if (!chat) throw new Error(`Chat with ID ${chatId} not found`);
    
    // Create a message with ID and timestamp
    const now = new Date().toISOString();
    const messageWithId = {
      ...message,
      id: `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: message.timestamp || now
    };
    
    // If it's a new message, add it to the list
    if (!message.id) {
      chat.messages.push(messageWithId);
    } 
    // If it's an existing message (like a streamed response), update it
    else {
      const index = chat.messages.findIndex(m => m.id === message.id);
      if (index !== -1) {
        chat.messages[index] = messageWithId;
      } else {
        chat.messages.push(messageWithId);
      }
    }
    
    // Update chat metadata
    chat.updatedAt = now;
    
    // Update preview with the latest message content (truncated)
    if (message.role === 'user') {
      chat.preview = message.content.length > 50 
        ? message.content.substring(0, 50) + '...' 
        : message.content;
    }
    
    this._saveChats();
    return messageWithId;
  }

  /**
   * Delete a chat
   * @param {string} id - Chat ID
   */
  deleteChat(id) {
    const index = this.chats.findIndex(chat => chat.id === id);
    if (index === -1) throw new Error(`Chat with ID ${id} not found`);
    
    this.chats.splice(index, 1);
    this._saveChats();
  }

  /**
   * Save chats to file
   * @private
   */
  _saveChats() {
    try {
      fs.writeFileSync(this.chatsFile, JSON.stringify(this.chats, null, 2));
    } catch (error) {
      console.error('Error saving chats data:', error);
      throw error;
    }
  }
}

module.exports = ChatManager;
