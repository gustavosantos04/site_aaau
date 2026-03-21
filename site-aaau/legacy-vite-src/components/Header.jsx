import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../styles/theme';

const Container = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing(2)};
  background-color: ${theme.colors.primary};
  color: ${theme.colors.white};
`;

export default function Header({ cartCount }) {
  return (
    <Container>
      <Link to="/" style={{ color: theme.colors.white, textDecoration: 'none' }}>
        <h1>Atlética Store</h1>
      </Link>
      <Link to="/checkout" style={{ color: theme.colors.white }}>
        Carrinho ({cartCount})
      </Link>
    </Container>
  );
}
