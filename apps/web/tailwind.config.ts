import type { Config } from 'tailwindcss';

/**
 * Design system tokens. RTL-first: use logical properties (ps/pe/ms/me) in markup.
 * Colors are driven by CSS variables so light/dark themes swap cleanly.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Station status palette (see spec §Dashboard floor plan)
        status: {
          available: 'hsl(142 71% 45%)',
          inUse: 'hsl(217 91% 60%)',
          ending: 'hsl(32 95% 55%)',
          fault: 'hsl(0 84% 60%)',
          disconnected: 'hsl(220 9% 60%)',
          reserved: 'hsl(271 76% 60%)',
          maintenance: 'hsl(48 96% 53%)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
