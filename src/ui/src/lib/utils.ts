export function isDeepEqual(obj1: any, obj2: any): boolean {
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((acc: any, key) => {
      if (obj[key] !== undefined) acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
  };
  return JSON.stringify(sortKeys(obj1)) === JSON.stringify(sortKeys(obj2));
}
