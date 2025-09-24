import User from "../models/userModel.js";
import Cart from "../models/cartModel.js";
import Wishlist from "../models/wishlistModel.js";


const loadWishlist = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;

        const wishlistData = await Wishlist.findOne({ user_id: userId }).populate("items.product_id");

        res.render("wishlist", { user: userData, wishlist: wishlistData, cartCount: cartItemCount });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const addToWishlist = async (req, res, next) => {
    try {
        const { productId } = req.body;
        const userId = req.session._id;
        const wishlist = await Wishlist.findOne({ user_id: userId });

        if (wishlist) {
            const existingWishlistItem = await Wishlist.findOne({ user_id: userId, 'items.product_id': productId });
            if (existingWishlistItem) {
                return res.status(200).json({ success: false, message: 'Product already in wishlist' });
            } else {
                await Wishlist.findOneAndUpdate(
                    { user_id: userId },
                    { $push: { items: { product_id: productId } } },
                    { new: true }
                );
                res.status(200).json({ success: true, message: "Product added to Wishlist successfully" });
            }

        } else {

            const newWishlistItem = new Wishlist({
                user_id: userId,
                items: [{ product_id: productId }]
            });
            await newWishlistItem.save();
            res.status(200).json({ success: true, message: "Product added to Wishlist successfully" });
        }

        console.log(productId);
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const removeProductFromWishlist = async (req, res, next) => {
    try {
        const { productId } = req.body;
        console.log(productId);
        const userId = req.session._id;
        await Wishlist.findOneAndUpdate(
            { user_id: userId },
            { $pull: { items: { product_id: productId } } }
        );
        res.status(200).json({ message: 'Product removed from wishlist successfully' });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


export {
    loadWishlist,
    addToWishlist,
    removeProductFromWishlist
}