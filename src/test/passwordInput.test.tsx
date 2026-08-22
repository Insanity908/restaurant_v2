import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from '@/components/ui/password-input';

describe('PasswordInput', () => {
  it('começa escondida e o botão mostra/esconde ao clicar', async () => {
    const user = userEvent.setup();
    render(<PasswordInput placeholder="Password" />);

    const input = screen.getByPlaceholderText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /mostrar password/i }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /esconder password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('escrever no campo continua a funcionar normalmente', async () => {
    const user = userEvent.setup();
    render(<PasswordInput placeholder="Password" />);
    const input = screen.getByPlaceholderText('Password');

    await user.type(input, 'segredo123');
    expect(input).toHaveValue('segredo123');
  });
});
