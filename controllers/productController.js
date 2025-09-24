import Products from "../models/productsModel.js";
import Category from "../models/categoryModel.js";
import sharp from "sharp";


const loadProducts = async (req, res,next) => {
    try {
        const page = parseInt(req.query.page || 1, 10);
        const query = (req.query.q || "").trim();
        const limit = 5;
        const skip = (page - 1) * limit;

        const textFilter = query
            ? {
                $or: [
                    { name: { $regex: query, $options: "i" } },
                    { brand: { $regex: query, $options: "i" } },
                    { gender: { $regex: query, $options: "i" } },
                ]
            }
            : {};

        const filter = { is_delete: 0, ...textFilter };

        const [productsData, totalProducts] = await Promise.all([
            Products.find(filter).populate("category").skip(skip).limit(limit),
            Products.countDocuments(filter)
        ]);
        const totalPages = Math.ceil(totalProducts / limit) || 1;

        const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
        if (wantsJson) {
            return res.json({ products: productsData, totalPages, currentPage: page, query });
        }

        res.render("products", { products: productsData, totalPages, currentPage: page, query });
       
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadAddProduct = async (req, res,next) => {
    try {
        const categories = await Category.find({ is_delete: 0 });
        const genders = ["Men", "Women", "Boys", "Girls"];
        res.render("add-product", { categories: categories, genders: genders });
        console.log("loadAddProduct")

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const addProduct = async (req, res,next) => {
    try {
        const { name, price, category, gender, brand, quantity, description } = req.body;

        const existingProductWithName = await Products.findOne({ name: name });

        if (existingProductWithName) {
            console.log("same name");
            return res.status(400).json({ success: false, message: "Product with the same name already exists." });
        } else {
            console.log("different name");
            const categoryId = await Category.findOne({ name: category }, { _id: 1 });

            let croppedImages = [];

            for (let i = 0; i < req.files.length; i++) {

                const croppedBuffer = await sharp(req.files[i].path)
                    .resize({ width: 500, height: 500, fit: sharp.fit.cover })
                    .toBuffer();

                const filename = `cropped_${req.files[i].originalname}`;
                croppedImages.push(filename);

                await sharp(croppedBuffer).toFile(`public/uploads/productImages/${filename}`);
            }

            const newProduct = new Products({
                name: name,
                price: price,
                offer_price:price,
                category: categoryId,
                gender: gender,
                brand: brand,
                quantity: quantity,
                description: description,
                images: croppedImages
            });
            await newProduct.save();
            res.status(200).json({ success: true });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const loadUnlsitedProducts = async (req, res,next) => {
    try {
        const page = req.query.page || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const productData = await Products.find({ is_delete: 1 }).populate("category").skip(skip).limit(limit);
        const totalProducts = await Products.countDocuments({});
        const totalPages = Math.ceil(totalProducts / limit);
        res.render("unlisted-products", { products: productData, totalPages, currentPage: page })
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const unlistProduct = async (req, res,next) => {
    try {
        const id = req.query.id;
        console.log("unlist");
        await Products.updateOne(
            { _id: id },
            { $set: { is_delete: 1 } }
        );

        res.redirect("/admin/products");

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const retrieveProduct = async (req, res,next) => {
    try {
        const id = req.query.id;
        console.log("unlist");
        await Products.updateOne(
            { _id: id },
            { $set: { is_delete: 0 } }
        );

        res.redirect("/admin/products/unlisted-products");

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadEditProduct = async (req, res,next) => {
    try {
        const productId = req.query.id;
        const productData = await Products.findOne({ _id: productId }).populate("category");
        const categories = await Category.find({ is_delete: 0 });
        const genders = ["Men", "Women", "Boy", "Girl"];
        res.render("edit-product", { product: productData, categories: categories, genders: genders });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const editProduct = async (req, res,next) => {
    try {
        const { id, name, price, category, gender, brand, quantity, description, deletedImages } = req.body;

        const existingProductWithName = await Products.findOne({ name: name, _id: { $ne: id } });
        if (existingProductWithName) {

            return res.status(400).json({ success: false, message: "A product with the same name already exists." });
        } else {

            const categoryId = await Category.findOne({ name: category }, { _id: 1 });
            
            const updatedProduct = await Products.findByIdAndUpdate(
                { _id: id },
                { $set: { name: name, price: price, category: categoryId, gender: gender, brand: brand, quantity: quantity, description: description } },
                { new: true }
            );

            const imageToDelete = JSON.parse(deletedImages);
            
            imageToDelete.forEach(async imageName => {
                const index = updatedProduct.images.indexOf(imageName);
                if (index !== -1) {
                    updatedProduct.images.splice(index, 1);
                }
            });

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {

                    const croppedBuffer = await sharp(req.files[i].path)
                        .resize({ width: 500, height: 500, fit: sharp.fit.cover })
                        .toBuffer();
                    const filename = `cropped_${req.files[i].originalname}`;
                    updatedProduct.images.push(filename);
                    await sharp(croppedBuffer).toFile(`public/uploads/productImages/${filename}`);
                }
            }

            await updatedProduct.save();
            res.status(200).json({ success: true, message: 'Product updated successfully' });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};


export {
    loadProducts,
    loadAddProduct,
    addProduct,
    loadUnlsitedProducts,
    unlistProduct,
    retrieveProduct,
    loadEditProduct,
    editProduct,
}