const Groq = require('groq-sdk');
const Order = require('../models/Order');
const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// @desc    Chat with AI (Smart: Chat + Actions + Clear Cart)
// @route   POST /api/ai/chat
const chatWithAI = async (req, res) => {
  const { message, history } = req.body;
  const userId = req.user._id;

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return res.status(500).json({ reply: "AI is unavailable." });

  const groq = new Groq({ apiKey: groqApiKey });

  try {
    // 1. GATHER CONTEXT
    const products = await Product.find().select('name price stock').limit(100);
    const productCatalog = products.map(p => `- ${p.name}`).join('\n');

    const userCart = await Cart.findOne({ user: userId });
    let cartSummary = "Empty";
    if (userCart && userCart.items.length > 0) {
        cartSummary = userCart.items.map(item => `${item.quantity}x ${item.name}`).join(', ');
    }

    // 2. SYSTEM PROMPT (Added CLEAR_CART back!)
    const systemPrompt = `
      You are PantryPal AI.
      
      --- INVENTORY ---
      ${productCatalog}
      
      --- CURRENT CART ---
      ${cartSummary}
      
      --- INSTRUCTIONS ---
      1. **GENERAL CHAT:** If the user greets you ("hi"), asks for recipes, or asks questions, use **NORMAL TEXT**.
      
      2. **SHOPPING ACTIONS:** If the user asks to Add, Remove, Subscribe, Clear, or Checkout, return a **JSON ARRAY**:
         - Add: [{"action": "ADD_TO_CART", "productName": "Exact Name", "quantity": 1}]
         - Subscribe: [{"action": "ADD_TO_SUBSCRIPTION", "productName": "Exact Name", "quantity": 1}]
         - Remove: [{"action": "REMOVE_FROM_CART", "productName": "Exact Name"}]
         - Clear: [{"action": "CLEAR_CART"}] <--- THIS WAS MISSING
         - Checkout: [{"action": "OPEN_CHECKOUT_MODAL"}]
      
      3. **RULES:**
         - Use exact product names from the inventory.
    `;

    // 3. CALL AI
    const conversationHistory = (history || []).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      model: 'moonshotai/kimi-k2-instruct-0905', 
      temperature: 0.1,
    });

    let aiReply = completion.choices[0]?.message?.content || "I'm speechless!";
    console.log("RAW AI REPLY:", aiReply);

    // 4. SMART PARSING
    const jsonMatch = aiReply.match(/(\[|\{)[\s\S]*(\]|\})/);

    if (jsonMatch) {
        try {
            let jsonString = jsonMatch[0];
            jsonString = jsonString.replace(/\}\s*\{/g, '}, {');
            if (jsonString.trim().startsWith('{')) jsonString = `[${jsonString}]`;

            let commands = JSON.parse(jsonString);
            if (!Array.isArray(commands)) commands = [commands];

            let successMessages = [];
            let actionAttempted = false; 

            for (const command of commands) {
                if (!command.action) continue; 
                actionAttempted = true;

                // === SMART PRODUCT FINDER ===
                let product = null;
                if (command.productName) {
                    product = await Product.findOne({ name: command.productName });
                    if (!product) product = await Product.findOne({ name: { $regex: new RegExp(`^${command.productName}$`, 'i') } });
                    if (!product) {
                         const safeName = command.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                         product = await Product.findOne({ name: { $regex: new RegExp(safeName, 'i') } });
                    }
                }

                // --- ACTIONS ---
                if (command.action === 'ADD_TO_CART') {
                    if (product) {
                        let cart = await Cart.findOne({ user: userId });
                        if (!cart) cart = await Cart.create({ user: userId, items: [] });
                        const itemIndex = cart.items.findIndex(p => p.product.toString() === product._id.toString());
                        if (itemIndex > -1) cart.items[itemIndex].quantity += command.quantity;
                        else cart.items.push({ 
                            product: product._id, name: product.name, quantity: command.quantity, price: product.price, image: product.imageUrl 
                        });
                        await cart.save();
                        successMessages.push(`Added ${command.quantity} x ${product.name} to Cart`);
                    } else {
                        successMessages.push(`❌ Couldn't find "${command.productName}" in store.`);
                    }
                }

                else if (command.action === 'ADD_TO_SUBSCRIPTION') {
                    if (product) {
                        let sub = await Subscription.findOne({ user: userId });
                        if (!sub) sub = await Subscription.create({ user: userId, items: [] });
                        
                        const existingItem = sub.items.find(i => i.product && i.product.toString() === product._id.toString());
                        if (existingItem) existingItem.quantity += command.quantity;
                        else sub.items.push({ 
                             product: product._id, name: product.name, quantity: command.quantity, price: product.price 
                        });
                        
                        sub.items = sub.items.filter(item => item.product && item.price != null);
                        await sub.save();
                        successMessages.push(`Subscribed to ${product.name}`);
                    } else {
                        successMessages.push(`❌ Couldn't find "${command.productName}" for subscription.`);
                    }
                }

                else if (command.action === 'REMOVE_FROM_CART') {
                    let cart = await Cart.findOne({ user: userId });
                    if(cart) {
                         const initialLen = cart.items.length;
                         // Fuzzy remove by name
                         cart.items = cart.items.filter(item => !item.name.toLowerCase().includes(command.productName.toLowerCase()));
                         if (cart.items.length < initialLen) {
                            await cart.save();
                            successMessages.push(`Removed ${command.productName}`);
                         } else {
                            successMessages.push(`Couldn't find ${command.productName} to remove.`);
                         }
                    }
                }
                
                else if (command.action === 'CLEAR_CART') {
                    await Cart.findOneAndUpdate({ user: userId }, { items: [] });
                    successMessages.push("Cart Cleared");
                }
                
                else if (command.action === 'OPEN_CHECKOUT_MODAL') {
                    successMessages.push("Opening checkout details...");
                    aiReply = "OPEN_CHECKOUT_MODAL_TRIGGER"; 
                }
            }

            if (actionAttempted && !aiReply.includes("TRIGGER")) {
                if (successMessages.length > 0) {
                    aiReply = `✅ Done! \n- ${successMessages.join('\n- ')}`;
                } else {
                    aiReply = "I tried to process that, but I encountered an issue finding the products.";
                }
            }

        } catch (e) {
            console.error("JSON Parsing Error:", e);
        }
    }

    res.json({ reply: aiReply });

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ reply: "My brain is offline." });
  }
};

module.exports = { chatWithAI };