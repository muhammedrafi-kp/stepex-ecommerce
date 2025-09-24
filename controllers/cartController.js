import User from "../models/userModel.js";
import Cart from "../models/cartModel.js";
import Product from "../models/productsModel.js";
import Razorpay from "razorpay";
import dotenv from 'dotenv';

dotenv.config();

const { RAZORPAY_ID_KEY, RAZORPAY_SECRET_KEY } = process.env;

const razorpay = new Razorpay({
    key_id: RAZORPAY_ID_KEY,
    key_secret: RAZORPAY_SECRET_KEY
});


const loadCart = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;

        res.render("cart", { user: userData, cart: cartData, cartCount: cartItemCount });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const addToCart = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const userId = req.session._id;
        const cart = await Cart.findOne({ user_id: userId });
        console.log(productId);

        if (cart) {
            const existingCartItem = await Cart.findOne({ user_id: userId, 'items.products': productId });

            if (existingCartItem) {
                return res.status(200).json({ success: false, message: 'Product already in cart' });
            } else {
                await Cart.findOneAndUpdate(
                    { user_id: userId },
                    { $push: { items: { products: productId } } },
                    { new: true }
                );
                res.status(200).json({ success: true, message: "Product added to cart successfully" });
            }
        } else {
            const newCartItem = new Cart({
                user_id: userId,
                items: [{ products: productId }]
            });
            await newCartItem.save();
            res.status(200).json({ success: true, message: "Product added to cart successfully" });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const updateCartQuantity = async (req, res, next) => {
    try {
        const { productId, quantity } = req.body;

        const userId = req.session._id;
        console.log(productId, quantity, userId);

        const cartData = await Cart.findOneAndUpdate(
            { user_id: userId, "items.products": productId },
            { $set: { "items.$.quantity": quantity } },
            { new: true }
        );

        res.status(200).json({ message: 'Cart quantity updated successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const removeProductFromCart = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const userId = req.session._id;

        await Cart.findOneAndUpdate(
            { user_id: userId },
            { $pull: { items: { products: productId } } }
        );

        res.status(200).json({ message: 'Product removed from cart successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

export {
    loadCart,
    addToCart,
    updateCartQuantity,
    removeProductFromCart
}