const Groq = require('groq-sdk');
const Order = require('../models/Order');
const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');
const Cart = require('../models/Cart');

// @desc    Chat with AI (Context-Aware + Memory + Tools + DEBUGGING)
// @route   POST /api/ai/chat
const chatWithAI = async (req, res) => {
  const { message, history } = req.body;
  const userId = req.user._id;

  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    console.error("DEBUG: Groq API key is missing.");
    return res.status(500).json({ reply: "AI is unavailable: missing API key." });
  }

  const groq = new Groq({ apiKey: groqApiKey });

  try {
    // ====================================================
    // 1. GATHER DATA CONTEXT
    // ====================================================

    // Fetch products (Limit 50)
    const products = await Product.find().select('name price stock category').limit(50);
    const productCatalog = products.map(p => 
        `- ${p.name}: ৳${p.price} (${p.stock > 0 ? 'In Stock' : 'Out of Stock'})`
    ).join('\n');

    // Fetch User Stats
    const orders = await Order.find({ user: userId });
    const totalSpent = orders.reduce((acc, order) => acc + order.totalPrice, 0);

    const pantryItems = await PantryItem.find({ user: userId });
    const allPantryNames = pantryItems.map(i => i.name).join(', ');
    
    // Find expiring items
    const expiringItems = pantryItems.filter(item => {
        const expiryDate = new Date(item.purchaseDate);
        expiryDate.setDate(expiryDate.getDate() + item.shelfLifeDays);
        const diffDays = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3 && diffDays >= 0;
    }).map(i => i.name).join(', ');

    // ====================================================
    // 2. CONSTRUCT SYSTEM PROMPT
    // ====================================================
    const systemPrompt = `
      You are PantryPal AI. You have access to the store's inventory and the user's pantry.
      
      --- STORE INVENTORY (Name: Price) ---
      ${productCatalog}
      
      --- USER CONTEXT ---
      - Total Spent: ৳${totalSpent}
      - Pantry Items: ${allPantryNames || "Empty"}
      - Expiring Soon: ${expiringItems || "None"}
      
      --- INSTRUCTIONS ---
      1. MEMORY: Use the conversation history to understand context.
      2. PRICE CHECKS: Check the INVENTORY list for prices.
      3. **ACTION - ADD TO CART**: If the user explicitly asks to add items to cart, you must reply with a JSON OBJECT ONLY.
         Format: { "action": "ADD_TO_CART", "productName": "exact_product_name_from_inventory", "quantity": number }
         Example: User says "Add 2 milk", you output: { "action": "ADD_TO_CART", "productName": "Fresh Milk (1L)", "quantity": 2 }
      4. NORMAL CHAT: For everything else, chat normally. Keep answers short.
    `;

    // ====================================================
    // 3. PREPARE HISTORY
    // ====================================================
    const conversationHistory = (history || []).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
    }));

    // ====================================================
    // 4. CALL GROQ API
    // ====================================================
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      model: 'moonshotai/kimi-k2-instruct-0905', 
      temperature: 0.1, // Low temp for accurate JSON
      max_tokens: 500,
    });

    let aiReply = completion.choices[0]?.message?.content || "I'm speechless!";

    // ====================================================
    // 5. DETECT & EXECUTE "ADD TO CART" (WITH LOGS)
    // ====================================================
    if (aiReply.trim().startsWith('{') && aiReply.includes("ADD_TO_CART")) {
        console.log("DEBUG: AI triggered a tool action."); // <--- LOG 1
        
        try {
            const command = JSON.parse(aiReply);
            console.log("DEBUG: Parsed Command:", command); // <--- LOG 2
            
            if (command.action === 'ADD_TO_CART') {
                // A. Find the real product
                const product = await Product.findOne({ name: command.productName });
                
                if (product) {
                    console.log(`DEBUG: Product found in DB: ${product.name} (ID: ${product._id})`); // <--- LOG 3

                    // B. Find or Create Cart
                    let cart = await Cart.findOne({ user: userId });
                    if (!cart) {
                        console.log("DEBUG: No cart found. Creating new cart..."); // <--- LOG 4
                        cart = await Cart.create({ user: userId, items: [] });
                    }

                    // C. Update Cart Items
                    const itemIndex = cart.items.findIndex(p => p.product.toString() === product._id.toString());

                    if (itemIndex > -1) {
                        cart.items[itemIndex].quantity += command.quantity;
                        console.log("DEBUG: Updated existing item quantity."); // <--- LOG 5
                    } else {
                        cart.items.push({ 
                            product: product._id, 
                            name: product.name, 
                            quantity: command.quantity, 
                            price: product.price,
                            image: product.imageUrl 
                        });
                        console.log("DEBUG: Pushed new item to cart."); // <--- LOG 6
                    }

                    // D. Save to DB
                    await cart.save();
                    console.log("DEBUG: Cart saved successfully to MongoDB!"); // <--- LOG 7

                    // E. Success Message
                    aiReply = `✅ Success! I have added ${command.quantity} x ${product.name} to your cart.`;
                } else {
                    console.log(`DEBUG: Product NOT found for name: "${command.productName}"`); // <--- LOG 8 (Error)
                    aiReply = `I tried to add "${command.productName}" but I couldn't find it in the database. Please check the exact name.`;
                }
            }
        } catch (e) {
            console.error("DEBUG: JSON Parsing or DB Save failed:", e); // <--- LOG 9 (Crash)
        }
    } else {
        console.log("DEBUG: Normal chat response (No action).");
    }

    res.json({ reply: aiReply });

  } catch (error) {
    console.error("DEBUG: Groq/AI Controller Error:", error);
    res.status(500).json({ reply: "My AI brain is currently offline. Please try again later." });
  }
};

module.exports = { chatWithAI };