import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
// futuramente:
// import Product from './pages/Product';
// import Checkout from './pages/Checkout';

export default function App() {
  const [cart, setCart] = useState([]);

  return (
    <Router>
      <Header cartCount={cart.length} />
      <Routes>
        <Route path="/" element={<Home />} />
        {/* <Route path="/product/:slug" element={<Product addToCart={setCart} />} /> */}
        {/* <Route path="/checkout" element={<Checkout cart={cart} />} /> */}
      </Routes>
    </Router>
  );
}
