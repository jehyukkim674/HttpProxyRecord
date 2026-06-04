// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useComposerVariables } from './useComposerVariables';

describe('useComposerVariables', () => {
  it('변수를 설정하고 누적한다', () => {
    const { result } = renderHook(() => useComposerVariables());

    act(() => result.current.setVariable('token', 'abc'));
    act(() => result.current.setVariable('id', '42'));

    expect(result.current.variables).toEqual({ token: 'abc', id: '42' });
  });

  it('같은 이름은 덮어쓴다', () => {
    const { result } = renderHook(() => useComposerVariables());
    act(() => result.current.setVariable('token', 'a'));
    act(() => result.current.setVariable('token', 'b'));
    expect(result.current.variables).toEqual({ token: 'b' });
  });

  it('변수를 제거한다', () => {
    const { result } = renderHook(() => useComposerVariables());
    act(() => result.current.setVariable('token', 'a'));
    act(() => result.current.setVariable('id', '1'));
    act(() => result.current.removeVariable('token'));
    expect(result.current.variables).toEqual({ id: '1' });
  });
});
