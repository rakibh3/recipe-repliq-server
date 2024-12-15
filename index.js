const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is alive!!!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const uri = process.env.REACT_APP_DB_URL;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const DEFAULT_PRICE = 14.99;
const TAX_RATE = 0.1;

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    const db = client.db('repliq-meal');
    const cartsCollection = db.collection('carts');

    const calculateCartTotals = (items) => {
      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const tax = parseFloat((subtotal * TAX_RATE).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));
      return {
        items,
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax,
        total,
      };
    };

    app.post('/cart', async (req, res) => {
      try {
        const { userId, item } = req.body;
        if (!userId || !item || !item.idMeal) {
          return res.status(400).send({
            success: false,
            error: 'userId and item with idMeal are required',
          });
        }

        const result = await cartsCollection.updateOne(
          { userId },
          {
            $setOnInsert: { createdAt: new Date() },
            $addToSet: {
              items: { ...item, quantity: 1, price: DEFAULT_PRICE },
            },
            $set: { updatedAt: new Date() },
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          return res.send({
            success: true,
            message: 'Cart created and item added',
            data: result,
          });
        } else if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: 'Item added to cart',
            data: result,
          });
        } else {
          return res
            .status(500)
            .send({ success: false, error: 'Failed to add item to cart' });
        }
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, error: 'Internal Server Error' });
      }
    });

    app.patch('/cart/:userId/:itemId', async (req, res) => {
      try {
        const { userId, itemId } = req.params;
        const { change } = req.body; // change can be +1 or -1
        if (!userId || !itemId || typeof change !== 'number') {
          return res
            .status(400)
            .send({ success: false, error: 'Invalid request data' });
        }

        const cart = await cartsCollection.findOne({ userId });
        const item = cart.items.find((item) => item.idMeal === itemId);

        if (!item)
          return res
            .status(404)
            .send({ success: false, error: 'Item not found' });

        const newQuantity = item.quantity + change;

        if (newQuantity <= 0) {
          await cartsCollection.updateOne(
            { userId },
            { $pull: { items: { idMeal: itemId } } }
          );
          return res.send({ success: true, message: 'Item removed from cart' });
        }

        await cartsCollection.updateOne(
          { userId, 'items.idMeal': itemId },
          { $set: { 'items.$.quantity': newQuantity, updatedAt: new Date() } }
        );
        return res.send({ success: true, message: 'Item quantity updated' });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, error: 'Internal Server Error' });
      }
    });

    app.delete('/cart/:userId/:itemId', async (req, res) => {
      try {
        const { userId, itemId } = req.params;
        await cartsCollection.updateOne(
          { userId },
          { $pull: { items: { idMeal: itemId } } }
        );
        res.send({ success: true, message: 'Item removed from cart' });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, error: 'Internal Server Error' });
      }
    });

    app.get('/cart/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const cart = await cartsCollection.findOne({ userId });

        if (!cart)
          return res.send({ success: true, cart: calculateCartTotals([]) });

        const cartTotals = calculateCartTotals(cart.items);
        res.send({ success: true, cart: cartTotals });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, error: 'Internal Server Error' });
      }
    });

    app.delete('/cart/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await cartsCollection.deleteOne({ userId });
        res.send({ success: true, message: 'Cart cleared successfully' });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, error: 'Internal Server Error' });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
