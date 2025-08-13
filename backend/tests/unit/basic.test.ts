describe('Basic Test Suite', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle string operations', () => {
    const text = 'hello world';
    expect(text.toUpperCase()).toBe('HELLO WORLD');
    expect(text.length).toBe(11);
  });

  test('should handle arrays', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr.length).toBe(5);
    expect(arr.includes(3)).toBe(true);
    expect(arr.find(x => x > 3)).toBe(4);
  });

  test('should handle async operations', async () => {
    const promise = new Promise<string>(resolve => {
      setTimeout(() => resolve('async result'), 10);
    });
    
    const result = await promise;
    expect(result).toBe('async result');
  });

  test('should handle error cases', () => {
    expect(() => {
      throw new Error('Test error');
    }).toThrow('Test error');
  });
});