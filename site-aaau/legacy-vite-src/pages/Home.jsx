import React from 'react';
import styled from 'styled-components';
import ProductCard from '../components/ProductCard';
import products from '../data/products.json';
import { theme } from '../styles/theme';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px,1fr));
  gap: ${theme.spacing(2)};
  padding: ${theme.spacing(2)};
`;

export default function Home() {
  return (
    <div>
      <h2 style={{ padding: theme.spacing(2) }}>Produtos em destaque</h2>
      <Grid>
        {products.map(p => <ProductCard key={p.id} product={p} />)}
      </Grid>
    </div>
  );
}
