import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';

type Props = { value: string; onChange: (value: string) => void };

/**
 * CodeMirror 에디터 래퍼. 무거운 에디터 의존성을 한 파일에 모아
 * ScriptsDrawer에서 React.lazy로 별도 청크 지연 로드한다.
 */
const ScriptEditor = ({ value, onChange }: Props) => (
  <CodeMirror value={value} height="320px" extensions={[javascript()]} onChange={onChange} />
);

export default ScriptEditor;
