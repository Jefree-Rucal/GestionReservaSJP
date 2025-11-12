import { render, screen } from '@testing-library/react';
import App from './App';

test('muestra el título principal de la aplicación', () => {
  render(<App />);
  const titulo = screen.getByText(/Gestión y Reserva San José Pinula/i);
  expect(titulo).toBeInTheDocument();
});
