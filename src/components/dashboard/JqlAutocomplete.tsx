'use client';

import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Zap, Search, Braces, User, Tag, Type, ListChecks, CheckCircle2 } from 'lucide-react';

type Suggestion = 
  | { kind: 'field'; label: string; icon: React.ReactNode; category?: string }
  | { kind: 'operator'; label: string; description?: string; category?: string }
  | { kind: 'value'; label: string; category?: string };

interface JqlAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  filterOptions: Record<string, string[]>;
  className?: string;
}

export const JqlAutocomplete = forwardRef<HTMLInputElement, JqlAutocompleteProps>(({
  value,
  onChange,
  placeholder = "Filter by JQL (e.g. status = Done AND priority = High)...",
  filterOptions,
  className = ""
}, ref) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose the internal input ref to the parent
  useImperativeHandle(ref, () => inputRef.current!);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fields: Suggestion[] = useMemo(() => [
    { label: 'project', icon: <Search className="h-3 w-3" />, kind: 'field' },
    { label: 'status', icon: <CheckCircle2 className="h-3 w-3" />, kind: 'field' },
    { label: 'statusCategory', icon: <CheckCircle2 className="h-3 w-3" />, kind: 'field' },
    { label: 'priority', icon: <Zap className="h-3 w-3" />, kind: 'field' },
    { label: 'issueType', icon: <Type className="h-3 w-3" />, kind: 'field' },
    { label: 'assignee', icon: <User className="h-3 w-3" />, kind: 'field' },
    { label: 'reporter', icon: <User className="h-3 w-3" />, kind: 'field' },
    { label: 'labels', icon: <Tag className="h-3 w-3" />, kind: 'field' },
    { label: 'components', icon: <Braces className="h-3 w-3" />, kind: 'field' },
    { label: 'key', icon: <Tag className="h-3 w-3" />, kind: 'field' },
    { label: 'summary', icon: <Type className="h-3 w-3" />, kind: 'field' },
    { label: 'storyPoints', icon: <ListChecks className="h-3 w-3" />, kind: 'field' },
  ], []);

  const operators: Suggestion[] = useMemo(() => [
    { label: '==', description: 'Equals', kind: 'operator' },
    { label: '!=', description: 'Not Equals', kind: 'operator' },
    { label: 'CONTAINS', description: 'Includes text', kind: 'operator' },
    { label: 'NOT CONTAINS', description: 'Excludes text', kind: 'operator' },
    { label: 'IN', description: 'In list', kind: 'operator' },
    { label: 'NOT IN', description: 'Not in list', kind: 'operator' },
    { label: 'AND', description: 'Both conditions', kind: 'operator' },
    { label: 'OR', description: 'Either condition', kind: 'operator' },
  ], []);

  // Get current word being typed
  const getCurrentWord = () => {
    const beforeCursor = inputValue.slice(0, cursorPosition);
    // Find the word fragment immediately before the cursor
    const match = beforeCursor.match(/[\w.-]*$/);
    return match ? match[0] : '';
  };

  const currentWord = getCurrentWord();

  const suggestions = useMemo(() => {
    if (!currentWord && !open) return [];

    const lowerWord = currentWord.toLowerCase();
    
    // Determine context: are we after a field and an operator?
    const beforeCursor = inputValue.slice(0, cursorPosition).trim();
    const parts = beforeCursor.split(/\s+/);
    const lastPart = parts[parts.length - 1]?.toUpperCase();
    const secondLastPart = parts[parts.length - 2]?.toUpperCase();
    const thirdLastPart = parts[parts.length - 3]?.toLowerCase();

    // If last part is an operator, suggest values for the field before it
    // @MX:ANCHOR: JQL Field Selection Logic
    // @MX:NOTE: This logic identifies the current field context by looking back from the cursor position to find operators like '=', '==', '!=', or 'CONTAINS'. It handles the special case of 'NOT CONTAINS' by checking the second to last part.
    // @MX:TODO: Implement a proper JQL parser to handle complex expressions, parentheses, and list-based operators (e.g., IN, NOT IN).
    // @MX:WARN: Position-based index access is brittle.
    // @MX:REASON: Relying on simple whitespace splitting and fixed array indices (parts.length - 2) fails when there are extra spaces, nested queries, or multi-word field names.
    let field: string | null = null;
    if ((lastPart === 'CONTAINS' || lastPart === 'IN') && secondLastPart === 'NOT') {
      field = thirdLastPart || null;
    } else if (lastPart && ['=', '==', '!=', 'CONTAINS', 'IN'].includes(lastPart)) {
      field = parts[parts.length - 2]?.toLowerCase() || null;
    }
    
    // Also handle context inside parentheses for IN (...)
    // This heuristic matches when the cursor is inside an unclosed IN(...) list
    if (!field && /(?:NOT\s+)?IN\s*\([^)]*$/i.test(beforeCursor)) {
      const partsBeforeIn = beforeCursor.split(/(?:NOT\s+)?IN\s*\(/i)[0].trim().split(/\s+/);
      field = partsBeforeIn[partsBeforeIn.length - 1]?.toLowerCase() || null;
      // Handle NOT IN (
      if (field?.toUpperCase() === 'NOT') {
        field = partsBeforeIn[partsBeforeIn.length - 2]?.toLowerCase() || null;
      }
    }

    if (field) {
      const fieldValues: Suggestion[] = [];
      
      // Suggest opening parenthesis for IN operators if not already there
      if (lastPart === 'IN') {
        fieldValues.push({ label: '(', description: 'Start list', kind: 'operator', category: 'Operators' });
      }

      if (field === 'status') fieldValues.push(...(filterOptions.status || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Status' })));
      else if (field === 'priority') fieldValues.push(...(filterOptions.priority || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Priority' })));
      else if (field === 'project') fieldValues.push(...(filterOptions.project || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Project' })));
      else if (field === 'issuetype') fieldValues.push(...(filterOptions.issueType || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Issue Type' })));
      else if (field === 'assignee') fieldValues.push(...(filterOptions.assignee || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Assignee' })));
      else if (field === 'label' || field === 'labels') fieldValues.push(...(filterOptions.label || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Label' })));
      else if (field === 'component' || field === 'components') fieldValues.push(...(filterOptions.component || []).map(v => ({ label: `"${v}"`, kind: 'value' as const, category: 'Component' })));
      
      return fieldValues.filter(v => v.label.toLowerCase().includes(lowerWord));
    }

    // Default: suggest fields and operators
    const filteredFields = fields.filter(f => f.label.toLowerCase().includes(lowerWord));
    const filteredOperators = operators.filter(o => o.label.toLowerCase().includes(lowerWord));

    return [
      ...filteredFields.map(f => ({ ...f, category: 'Fields' })),
      ...filteredOperators.map(o => ({ ...o, category: 'Operators' }))
    ];
  }, [currentWord, fields, operators, filterOptions, inputValue, cursorPosition, open]);

  const handleSelect = (suggestion: string) => {
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const textAfterCursor = inputValue.slice(cursorPosition);
    
    // Find the start of the current word being typed
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const prefix = lastSpaceIndex === -1 ? '' : textBeforeCursor.slice(0, lastSpaceIndex + 1);
    
    const newValue = prefix + suggestion + ' ' + textAfterCursor.trimStart();
    onChange(newValue);
    setInputValue(newValue);
    setOpen(false);
    
    // Refocus and set cursor to the end of the inserted word
    const newCursorPos = prefix.length + suggestion.length + 1;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  return (
    <div className={`relative w-full ${className}`}>
      <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                onChange(e.target.value);
                setCursorPosition(e.target.selectionStart || 0);
                if (!open) setOpen(true);
              }}
              onClick={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
              onFocus={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
              onKeyUp={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
              className="h-9 pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs focus:ring-emerald-500/20"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[300px] p-0 border-slate-200 dark:border-slate-800 shadow-xl" 
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="bg-white dark:bg-slate-950">
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No suggestions found.</CommandEmpty>
              {['Fields', 'Operators', 'Status', 'Priority', 'Project', 'Issue Type', 'Assignee'].map(category => {
                const categorySuggestions = suggestions.filter(s => s.category === category);
                if (categorySuggestions.length === 0) return null;
                
                return (
                  <CommandGroup key={category} heading={category}>
                    {categorySuggestions.map((s, idx) => (
                      <CommandItem
                        key={`${category}-${idx}`}
                        onSelect={() => handleSelect(s.label)}
                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {/* 
                          @MX:ANCHOR: Suggestion Item Rendering
                          @MX:NOTE: Renders individual suggestion items with icons for fields and hash symbols for values.
                          @MX:TODO: Support custom icon rendering for specific value types (e.g. project avatars).
                          @MX:WARN: Discriminant (kind) is used to safely access icons and descriptions.
                          @MX:REASON: Suggestion items can be fields, operators, or values, each with different optional properties.
                        */}
                        {s.kind === 'field' ? s.icon : <span className="w-3 h-3 flex items-center justify-center text-[10px] font-bold text-slate-400">#</span>}
                        <span className="text-xs font-medium">{s.label}</span>
                        {s.kind === 'operator' && s.description && <span className="ml-auto text-[10px] text-slate-400">{s.description}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
});

JqlAutocomplete.displayName = 'JqlAutocomplete';
