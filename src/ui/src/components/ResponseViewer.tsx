import { useState } from 'react';

interface ResponseViewerProps {
  response: any;
  isSending?: boolean;
}

export function ResponseViewer({ response, isSending }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState('body');

  const handleCopy = () => {
    if (response?.body) {
      const txt = typeof response.body === 'object' ? JSON.stringify(response.body, null, 2) : response.body;
      navigator.clipboard.writeText(txt);
    }
  };

  if (!response && !isSending) {
    return (
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 bg-gray-950 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-300">Response</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600">
          Send a request to see the response
        </div>
      </div>
    );
  }

  const { status, latency, body, headers } = response || {};
  const isError = status >= 400;
  
  const syntaxHighlight = (jsonStr: string) => {
    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'text-blue-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-zinc-300'; // key
        } else {
          cls = 'text-green-400'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-gray-500'; // null
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  };

  const getBodyHtml = () => {
    if (body === undefined || body === null) return '';
    try {
      const str = typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
      // Basic JSON detect
      if (typeof str === 'string' && (str.trim().startsWith('{') || str.trim().startsWith('['))) {
        return syntaxHighlight(str);
      }
      return str; // plain text
    } catch {
      return String(body);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-950 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-300">Response</span>
        {isSending ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sending...
          </div>
        ) : (
          <div className="flex gap-4 text-sm font-mono items-center">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isError ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
              {status} {isError ? 'Error' : 'OK'}
            </span>
            <span className="text-gray-400">{latency || 0} ms</span>
            <button 
              onClick={handleCopy}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded transition-colors ml-2"
            >
              Copy
            </button>
          </div>
        )}
      </div>
      
      {response?.assertions && response.assertions.length > 0 && !isSending && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex gap-4 overflow-x-auto">
          {response.assertions.map((ass: any, i: number) => (
            <div key={i} className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${ass.passed ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              <span>{ass.passed ? '✅' : '❌'}</span>
              <span className="font-mono">{ass.assertion.field}</span>
              <span className="text-gray-500">{ass.assertion.operator}</span>
              <span>{ass.assertion.value}</span>
              {!ass.passed && (
                <span className="ml-2 text-red-300 opacity-80">(got: {ass.actual})</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex border-b border-gray-800 px-2 bg-gray-950">
        {['body', 'headers', 'raw'].map(tab => (
          <button 
            key={tab}
            disabled={isSending}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'} disabled:opacity-50`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-900 font-mono text-sm relative">
        {isSending && (
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm z-10" />
        )}
        
        {activeTab === 'body' && body !== undefined && body !== null && (
          <pre className="p-4 text-gray-300 whitespace-pre-wrap outline-none" dangerouslySetInnerHTML={{ __html: getBodyHtml() }} />
        )}
        
        {activeTab === 'headers' && headers && (
          <div className="w-full">
            {Object.entries(headers).map(([key, val]) => (
              <div key={key} className="flex border-b border-gray-800 hover:bg-gray-800/50">
                <div className="w-1/3 p-2 text-gray-400 font-semibold border-r border-gray-800 break-all">{key}</div>
                <div className="w-2/3 p-2 text-gray-300 break-all">{String(val)}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'raw' && response && (
          <pre className="p-4 text-gray-400 whitespace-pre overflow-x-auto">
            HTTP/1.1 {status} {isError ? 'Error' : 'OK'}{'\n'}
            {Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
            {'\n\n'}
            {typeof body === 'object' ? JSON.stringify(body, null, 2) : body}
          </pre>
        )}
      </div>
    </div>
  );
}
