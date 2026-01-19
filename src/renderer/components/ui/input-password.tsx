'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Button } from './button';
import { Input } from './input';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';

export function InputPassword(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <InputGroup>
      <InputGroupInput type={showPassword ? 'text' : 'password'} {...props} />
      <InputGroupAddon align="inline-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
