import { useMemo } from 'react';
import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext } from '@codemirror/autocomplete';
import { tooltips } from '@codemirror/view';
import type { VariableItem } from '../components/VariableInput';

export function useVarCompletion(availableVariables: VariableItem[]) {
  return useMemo(() => {
    return [
      autocompletion({
        override: [
          (context: CompletionContext) => {
            const match = context.matchBefore(/\{\{[a-zA-Z0-9_-]*/);
            if (!match || (match.from === match.to && !context.explicit)) return null;
            const typed = match.text.slice(2); // strip {{
            const options = availableVariables
              .filter(v => v.name.toLowerCase().includes(typed.toLowerCase()))
              .map(v => ({
                label: `{{${v.name}}}`,
                apply: `{{${v.name}}}`,
                detail: `${v.sourceType}${v.value !== undefined ? ` = ${v.value}` : ''}`,
                type: 'variable',
              }));
            if (options.length === 0) return null;
            return { from: match.from, options };
          },
        ],
      }),
      // Render tooltips in a portal so they aren't clipped by overflow-hidden containers (like SplitPane or panels)
      tooltips({ parent: document.body })
    ];
  }, [availableVariables]);
}
