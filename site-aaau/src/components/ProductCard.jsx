import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../styles/theme';

const Card = styled.div`
  background-color: ${theme.colors.white};
  border-radius: ${theme.borderRadius};
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  padding: ${theme.spacing(2)};
  text-align: center;
`;

export default function ProductCard({ product }) {
  return (
    <Card>
      <Link to={`/product/${product.slug}`}>
        <img src={product.images[0]} alt={product.name} style={{ width: '100%', borderRadius: theme.borderRadius }} />
        <h3>{product.name}</h3>
        <p>R$ {product.price.toFixed(2)}</p>
      </Link>
    </Card>
  );
}
