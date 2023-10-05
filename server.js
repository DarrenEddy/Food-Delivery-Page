const express = require("express");
const app = express();
app.use(express.static("assets"));

const HTTP_PORT = process.env.PORT || 8080;
const path = require("path");

app.use(express.urlencoded({ extended: true }))

const exphbs = require("express-handlebars");
app.engine(".hbs", exphbs.engine({ extname: ".hbs" }));
app.set("view engine", ".hbs");

const mongoose = require('mongoose');

const CONNECTION_STRING = "mongodb+srv://dbUser:ZwtWLObPOyNN2pi1@cluster0.ab9me3p.mongodb.net/MADS4012Project?retryWrites=true&w=majority";

mongoose.connect(CONNECTION_STRING)

const db = mongoose.connection
db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => {
    console.log("Mongo DB connected successfully.");
});

const Schema = mongoose.Schema
const MenuSchema = new Schema({ name: String, description: String, price: Number, image: String })
const menuCollection = mongoose.model("menu-item", MenuSchema)
const OrderSchema = new Schema({ customerName: String, address: String, items: [String], dateAndTime: String })
const orderCollection = mongoose.model("order-item", OrderSchema)
const DriverSchema = new Schema({ username: String, password: String, fullName: String, vModel: String, vColour: String, license: String })
const driverCollection = mongoose.model("driver-item", DriverSchema)

const currentOrder = []


// ===================== /menu =============================
app.get("/", async (req, res) => {
    try {
        const results = await menuCollection.find().lean().exec();

        for (item of results) {
            if (currentOrder.indexOf(item.name) >= 0) {
                item.contained = true
            }
            else {
                item.contained = false
            }
        }

        res.render("menu", { layout: false, menu: results })
    } catch (err) {
        console.log(err);
        return res.send(err)
    }
})

//===================== Your Order ================================
app.get("/yourOrder", async (req, res) => {

    try {
        const orderMenuItems = []
        for (nameOfItem of currentOrder) {
            const results = await menuCollection.findOne({ name: nameOfItem }).lean().exec()
            orderMenuItems.push(results)
        }
        return res.render("yourOrder", { layout: false, order: orderMenuItems })
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }
})

app.get("/addToCart/:menuItemName", (req, res) => {
    const item = req.params.menuItemName
    //for checking if its already in the list ==REMOVE IF IMPLEMENTING QUANTITIY
    if (currentOrder.indexOf(item) < 0) {
        currentOrder.push(item)
    }
    //console.log(currentOrder)
    res.redirect("/")
})

app.get("/removeFromCart/:menuItemName/:redir", (req, res) => {
    const item = req.params.menuItemName

    currentOrder.splice(currentOrder.indexOf(item), 1)

    //redir handles where to redirect as this get method is used by both menu and Your Orders
    const redir = (req.params.redir == "menu") ? "" : req.params.redir
    res.redirect("/"+redir)
})

app.get("/emptyCart", (req, res) => {
    currentOrder.splice(0,currentOrder.length)
    res.redirect("/yourOrder")
})

// =================== Order Status =================================
app.get("/orderStatus", async (req, res) => {
    res.render("orderStatus", { layout: false })
})

// =================== Order History ================================
app.get("/orderHistory", (req, res) => {
    res.render("orderHistory", { layout: false })
})

const onHttpStart = () => {
    console.log(`The web server has started at http://localhost:${HTTP_PORT}`);
    console.log("Press CTRL+C to stop the server.");
};

app.listen(HTTP_PORT, onHttpStart);
