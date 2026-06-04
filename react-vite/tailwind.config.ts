import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'hsl(var(--bg))',
          surface: 'hsl(var(--bg-surface))',
          elevated: 'hsl(var(--bg-elevated))',
          hover: 'hsl(var(--bg-hover))',
        },
        fg: {
          DEFAULT: 'hsl(var(--fg))',
          muted: 'hsl(var(--fg-muted))',
          subtle: 'hsl(var(--fg-subtle))',
        },
        line: {
          DEFAULT: 'hsl(var(--line))',
          subtle: 'hsl(var(--line-subtle))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          subtle: 'hsl(var(--primary-subtle))',
          muted: 'hsl(var(--primary-muted))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          muted: 'hsl(var(--success-muted))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          muted: 'hsl(var(--warning-muted))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          hover: 'hsl(var(--danger-hover))',
          muted: 'hsl(var(--danger-muted))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          muted: 'hsl(var(--accent-muted))',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Noto Sans"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        serif: [
          'Georgia',
          '"Times New Roman"',
          'Times',
          'serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1.5' }],
        sm: ['0.75rem', { lineHeight: '1.5' }],
        base: ['0.875rem', { lineHeight: '1.6' }],
        lg: ['1rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.3' }],
        '2xl': ['1.5rem', { lineHeight: '1.3' }],
      },
      spacing: {
        0.5: '0.125rem',
        1: '0.25rem',
        1.5: '0.375rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
      },
    },
  },
  plugins: [],
}

export default config
