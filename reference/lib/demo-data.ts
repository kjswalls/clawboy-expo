import type { Message, Session, ServerProfile } from './types'

export const demoSessions: Session[] = [
  {
    id: '1',
    title: 'React Component Architecture',
    preview: 'Can you help me structure my React components?',
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    isPinned: true,
    messageCount: 12,
  },
  {
    id: '2',
    title: 'API Design Discussion',
    preview: 'Let me explain the REST API patterns...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    isPinned: true,
    messageCount: 8,
  },
  {
    id: '3',
    title: 'Debug TypeScript Error',
    preview: 'The type error you are seeing is because...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
    isPinned: false,
    messageCount: 15,
  },
  {
    id: '4',
    title: 'Database Schema Design',
    preview: 'For a normalized schema, you should...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isPinned: false,
    messageCount: 6,
  },
  {
    id: '5',
    title: 'Performance Optimization',
    preview: 'Here are some tips for optimizing your app...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    isPinned: false,
    messageCount: 22,
  },
]

export const demoMessages: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'Can you help me understand how to implement a custom hook for form validation in React?',
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
  },
  {
    id: '2',
    role: 'assistant',
    content: '',
    timestamp: new Date(Date.now() - 1000 * 60 * 9),
    thinking: [
      {
        id: 't1',
        content: 'The user is asking about custom hooks for form validation. I should explain the core concepts and provide a practical example that demonstrates:\n1. Managing form state\n2. Handling validation rules\n3. Tracking touched fields\n4. Returning useful values and handlers',
        isExpanded: false,
        duration: '2s',
      },
    ],
    toolCalls: [
      {
        id: 'tc1',
        type: 'web_search',
        name: 'React form validation patterns 2024',
        input: 'react custom hook form validation best practices',
        output: 'Found 5 relevant articles on React form validation patterns...',
        status: 'completed',
      },
    ],
  },
  {
    id: '3',
    role: 'assistant',
    content: `I'd be happy to help you create a custom form validation hook! Here's a robust implementation:

## Custom useFormValidation Hook

\`\`\`typescript
import { useState, useCallback } from 'react';

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
}

interface FormConfig {
  [field: string]: ValidationRule;
}

export function useFormValidation<T extends Record<string, string>>(
  initialValues: T,
  validationRules: FormConfig
) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validate = useCallback((field: string, value: string) => {
    const rules = validationRules[field];
    if (!rules) return null;

    if (rules.required && !value.trim()) {
      return 'This field is required';
    }
    if (rules.minLength && value.length < rules.minLength) {
      return \`Minimum \${rules.minLength} characters required\`;
    }
    return null;
  }, [validationRules]);

  const handleChange = useCallback((field: string, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    const error = validate(field, value);
    setErrors(prev => ({ ...prev, [field]: error || '' }));
  }, [validate]);

  return { values, errors, touched, handleChange };
}
\`\`\`

### Key Features

- **Type-safe**: Full TypeScript support with generics
- **Flexible validation**: Support for required, length, pattern, and custom rules
- **Touch tracking**: Only show errors after user interaction
- **Performant**: Uses \`useCallback\` to prevent unnecessary re-renders

Would you like me to show you how to use this hook in a form component?`,
    timestamp: new Date(Date.now() - 1000 * 60 * 8),
  },
  {
    id: '4',
    role: 'user',
    content: 'Yes, please show me an example usage!',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: '5',
    role: 'assistant',
    content: '',
    timestamp: new Date(Date.now() - 1000 * 60 * 4),
    thinking: [
      {
        id: 't2',
        content: 'Now I need to create a practical example showing the hook in action. I should create a simple signup form that demonstrates all the validation features.',
        isExpanded: true,
        duration: '1s',
      },
    ],
    toolCalls: [
      {
        id: 'tc2',
        type: 'code_execution',
        name: 'Generate example form component',
        input: 'Create SignupForm.tsx using the useFormValidation hook',
        output: 'Component generated successfully with email and password validation',
        status: 'completed',
      },
    ],
  },
  {
    id: '6',
    role: 'assistant',
    content: `Here's a complete example of a signup form using our custom hook:

\`\`\`tsx
function SignupForm() {
  const { values, errors, touched, handleChange, handleBlur } = useFormValidation(
    { email: '', password: '' },
    {
      email: { required: true, pattern: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/ },
      password: { required: true, minLength: 8 }
    }
  );

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={values.email}
        onChange={e => handleChange('email', e.target.value)}
        onBlur={() => handleBlur('email')}
      />
      {touched.email && errors.email && (
        <span className="error">{errors.email}</span>
      )}
      
      <button type="submit">Sign Up</button>
    </form>
  );
}
\`\`\`

This gives you real-time validation with a clean, reusable pattern!`,
    timestamp: new Date(Date.now() - 1000 * 60 * 3),
  },
]

export const demoMessagesEmpty: Message[] = []

export const demoMessagesStreaming: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'How do I optimize my Next.js application for production?',
    timestamp: new Date(Date.now() - 1000 * 30),
  },
  {
    id: '2',
    role: 'assistant',
    content: '',
    timestamp: new Date(Date.now() - 1000 * 20),
    isStreaming: true,
    thinking: [
      {
        id: 't1',
        content: 'The user is asking about Next.js optimization. I should cover the most impactful areas: image optimization, code splitting, caching strategies, and build configuration...',
        isExpanded: true,
      },
    ],
    toolCalls: [
      {
        id: 'tc1',
        type: 'web_search',
        name: 'Next.js optimization best practices',
        status: 'running',
      },
    ],
  },
]

export const demoServerProfiles: ServerProfile[] = [
  {
    id: '1',
    name: 'Local Dev',
    url: 'http://localhost:8080',
    authToken: 'dev-token-xxx',
    isActive: true,
  },
  {
    id: '2',
    name: 'Production',
    url: 'https://api.clawboy.app',
    authToken: 'prod-token-xxx',
    isActive: false,
  },
]
