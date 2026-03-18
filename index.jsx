import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection,
  query
} from 'firebase/firestore';

// --- CONFIGURATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fetch-workshop-v3';

const ALLOWED_LOGINS = [
  "aliaskarov_d", "baev_m", "bazarbay_n", "bayramly_a", "zhakupov_a", 
  "zotov_a", "ivanenko_a", "ismailov_i", "kenzhebaev_a", "kopylkova_a", 
  "korolev_d", "lazarenko_d", "mamankeldinov_a", "mamonov_y", 
  "polovets_v", "reshetov_d", "tekhneriadnev_a", "usoltsev_a", "brysokov_a"
];

const quizData = [
  { q: "Как определяется this в стрелочных функциях?", a: ["На объект перед точкой", "Свой собственный контекст", "Берется из внешнего лексического окружения", "Через метод .bind()"], correct: 2 },
  { q: "[a, b, ...c] = [1,2,3,4,5]; log(c)?", a: ["3", "[1,2,3,4,5]", "[3,4,5]", "undefined"], correct: 2 },
  { q: "Spread для копии массива + 0 в начало?", a: ["[0, arr]", "[0, ...arr]", "spread(0, arr)", "[0] + arr"], correct: 1 },
  { q: "Где вызывается super()?", a: ["В конце", "В начале, до this", "В методах", "Необязательно"], correct: 1 },
  { q: "user?.profile?.name если profile undefined?", a: ["Ошибка", "null", "undefined", "false"], correct: 2 }
];

const practicalTasks = [
  { id: 1, title: "Заголовки постов", goal: "Выведите в консоль заголовок (title) поста.", url: "https://jsonplaceholder.typicode.com/posts/1" },
  { id: 2, title: "Имена авторов", goal: "Получите имя (name) пользователя и выведите в консоль.", url: "https://jsonplaceholder.typicode.com/users/1" },
  { id: 3, title: "Электронная почта", goal: "Найдите email пользователя и отобразите его.", url: "https://jsonplaceholder.typicode.com/users/2" },
  { id: 4, title: "География", goal: "Выведите название города (address.city) из данных пользователя.", url: "https://jsonplaceholder.typicode.com/users/3" },
  { id: 5, title: "Место работы", goal: "Получите название компании (company.name).", url: "https://jsonplaceholder.typicode.com/users/4" },
  { id: 6, title: "Текст комментария", goal: "Выведите тело (body) первого комментария.", url: "https://jsonplaceholder.typicode.com/comments/1" }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [currentUserLogin, setCurrentUserLogin] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [role, setRole] = useState('guest'); 
  const [currentSection, setCurrentSection] = useState('login');
  const [assignments, setAssignments] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);

  const [quizAnswers, setQuizAnswers] = useState({});
  const [battleCode, setBattleCode] = useState("");
  const [battleError, setBattleError] = useState("");

  const [evalTarget, setEvalTarget] = useState(null);
  const [pScore, setPScore] = useState(0);
  const [cScore, setCScore] = useState(0);

  // Auth Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { 
        console.error("Auth Error:", e);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Sync Data
  useEffect(() => {
    if (!user) return;

    const assignmentsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'assignments', 'global');
    const unsubAssign = onSnapshot(assignmentsDocRef, (snap) => {
      if (snap.exists()) setAssignments(snap.data());
      else setAssignments({});
    }, (err) => console.error("Sync error", err));

    const resultsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'results');
    const unsubResults = onSnapshot(resultsColRef, (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setResults(data);
    }, (err) => console.error("Sync error", err));

    return () => { unsubAssign(); unsubResults(); };
  }, [user]);

  const handleLogin = () => {
    const login = currentUserLogin.trim().toLowerCase();
    if (!ALLOWED_LOGINS.includes(login)) return alert("Логин не найден!");
    
    setRole('student');
    const res = results[login] || {};
    if (res.completed) setCurrentSection('final');
    else if (res.quiz !== undefined) setCurrentSection('pair');
    else setCurrentSection('quiz');
  };

  const handleAdminLogin = () => {
    if (adminPassword === "admin") {
      setRole('admin');
      setCurrentSection('setup');
      setShowAdminLogin(false);
    } else {
      alert("Неверный пароль администратора");
    }
  };

  const generateTasks = async () => {
    if (!user) return;
    const shuffled = [...ALLOWED_LOGINS].sort(() => Math.random() - 0.5);
    const newAssignments = {};
    const pairs = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) pairs.push([shuffled[i], shuffled[i+1]]);
      else pairs[pairs.length-1].push(shuffled[i]);
    }

    pairs.forEach(group => {
      const task = practicalTasks[Math.floor(Math.random() * practicalTasks.length)];
      group.forEach(member => {
        const partners = group.filter(m => m !== member).join(', ');
        newAssignments[member] = { partners, task };
      });
    });

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assignments', 'global'), newAssignments);
      alert("Пары сформированы успешно!");
    } catch (e) { alert(e.message); }
  };

  const downloadCSV = () => {
    const sep = ";";
    const headers = ["Login", "QuizScore", "PairScore", "CodeScore", "TotalScore", "CodeText"];
    let csvRows = ["sep=;", headers.join(sep)];

    ALLOWED_LOGINS.forEach(login => {
      const res = results[login] || {};
      const q = Number(res.quiz) || 0;
      const ps = Number(res.pairScore) || 0;
      const cs = Number(res.codeScore) || 0;
      const total = q + ps + cs;
      const code = res.codeText ? `"${res.codeText.replace(/"/g, '""').replace(/\n/g, ' ')}"` : "";
      const row = [login, q, ps, cs, total, code];
      csvRows.push(row.join(sep));
    });
    
    const csvString = csvRows.join("\n");
    const blob = new Blob(["\ufeff" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `results_${appId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const finishQuiz = async () => {
    if (!user) return;
    const total = Object.entries(quizAnswers).reduce((acc, [idx, ansIdx]) => {
      return acc + (ansIdx === quizData[idx].correct ? 10 : 0);
    }, 0);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', currentUserLogin), { quiz: total }, { merge: true });
    setCurrentSection('pair');
  };

  const submitBattle = async () => {
    if (!user) return;
    const code = battleCode.toLowerCase();
    if (!code.includes('async') || !code.includes('await')) {
      setBattleError("Ошибка: Вы должны использовать синтаксис async/await!"); 
      return;
    }
    if (!code.includes('try') || !code.includes('catch')) {
      setBattleError("Ошибка: Обязательно добавьте блок try/catch для обработки ошибок!"); 
      return;
    }
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', currentUserLogin), {
      codeText: battleCode, completed: true, timestamp: new Date().toISOString()
    }, { merge: true });
    setCurrentSection('final');
  };

  const saveEval = async () => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', evalTarget), {
      pairScore: parseInt(pScore) || 0, codeScore: parseInt(cScore) || 0
    }, { merge: true });
    setEvalTarget(null);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen font-bold text-indigo-600 animate-pulse text-lg">Загрузка данных...</div>;

  const isAssigned = Object.keys(assignments).length > 0;

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        
        <header className="text-center mb-8">
          <h1 className="text-4xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Fetch API Workshop
          </h1>
          {role !== 'guest' && (
            <div className="flex flex-col items-center">
              <span className="text-slate-500 font-mono text-sm bg-slate-100 px-3 py-1 rounded-full">{String(currentUserLogin) || 'Admin'}</span>
              <button onClick={() => window.location.reload()} className="text-[10px] text-red-500 font-bold uppercase hover:underline mt-2 tracking-widest">Выйти</button>
            </div>
          )}
        </header>

        {role === 'admin' && (
          <div className="flex justify-center gap-2 mb-8 flex-wrap">
            <button onClick={() => setCurrentSection('setup')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${currentSection === 'setup' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border hover:bg-slate-50'}`}>Группы</button>
            <button onClick={() => setCurrentSection('admin-view')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${currentSection === 'admin-view' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border hover:bg-slate-50'}`}>Мониторинг</button>
            <button onClick={downloadCSV} className="px-4 py-2 rounded-xl text-sm font-bold transition bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-600 hover:text-white flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Экспорт CSV
            </button>
          </div>
        )}

        <main>
          {currentSection === 'login' && !showAdminLogin && (
            <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md mx-auto border border-slate-200">
              <h2 className="text-2xl font-bold mb-6 text-center">Вход для студентов</h2>
              <input 
                type="text" 
                value={currentUserLogin}
                onChange={(e) => setCurrentUserLogin(e.target.value)}
                className="w-full p-4 border rounded-2xl mb-4 text-center font-mono focus:ring-2 focus:ring-indigo-400 outline-none" 
                placeholder="ваш_логин"
              />
              <button onClick={handleLogin} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg transition hover:bg-indigo-700">Войти</button>
              <button onClick={() => setShowAdminLogin(true)} className="w-full text-xs text-slate-300 mt-6 uppercase hover:text-indigo-400 transition tracking-tighter">Панель администратора</button>
            </div>
          )}

          {showAdminLogin && (
            <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md mx-auto border border-indigo-200">
              <h2 className="text-2xl font-bold mb-6 text-center text-indigo-800">Преподаватель</h2>
              <input 
                type="password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full p-4 border rounded-2xl mb-4 text-center focus:ring-2 focus:ring-indigo-400 outline-none" 
                placeholder="Пароль"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowAdminLogin(false)} className="flex-1 border py-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition">Назад</button>
                <button onClick={handleAdminLogin} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition">Войти</button>
              </div>
            </div>
          )}

          {currentSection === 'setup' && (
            <div className="space-y-6">
              <div className="bg-white p-10 rounded-3xl shadow-xl text-center border border-slate-100">
                <h2 className="text-2xl font-bold mb-2 text-indigo-900">Управление группами</h2>
                <div className="mb-8 flex flex-col items-center">
                  <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4 ${isAssigned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${isAssigned ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                    {isAssigned ? 'Распределение активно' : 'Требуется распределение'}
                  </div>
                  <button onClick={generateTasks} className={`px-10 py-4 rounded-2xl font-bold shadow-xl transition transform active:scale-95 ${isAssigned ? 'bg-white border-2 border-indigo-600 text-indigo-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {isAssigned ? 'Пересоздать пары' : 'Распределить студентов'}
                  </button>
                </div>
              </div>

              {isAssigned && (
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
                  <h3 className="font-bold text-slate-500 mb-4 uppercase text-xs tracking-widest">Текущее распределение</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(assignments).reduce((acc, [login, data]) => {
                      const partner = data.partners;
                      const pairId = [login, partner].sort().join('-');
                      if (!acc.find(i => i.id === pairId)) {
                        acc.push({ id: pairId, login1: login, login2: partner, task: data.task.title });
                      }
                      return acc;
                    }, []).map((pair, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono font-bold text-indigo-600 text-sm">{pair.login1} + {pair.login2}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium italic">{pair.task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentSection === 'quiz' && (
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm">1</span> 
                Этап 1: Блиц-тест
              </h2>
              <div className="space-y-6">
                {quizData.map((q, i) => (
                  <div key={i} className="p-4 border rounded-xl">
                    <p className="font-bold mb-3">{i+1}. {q.q}</p>
                    <div className="grid gap-2">
                      {q.a.map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-50 rounded-lg transition">
                          <input type="radio" name={`q${i}`} disabled={quizAnswers[i] !== undefined} className="w-4 h-4 text-indigo-600" onChange={() => setQuizAnswers({...quizAnswers, [i]: oi})} /> 
                          <span className={quizAnswers[i] !== undefined && oi === q.correct ? 'font-bold text-green-700' : ''}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button disabled={Object.keys(quizAnswers).length < quizData.length} onClick={finishQuiz} className="mt-8 w-full bg-indigo-600 text-white py-4 rounded-xl font-bold disabled:bg-slate-300 shadow-md transition hover:bg-indigo-700">Перейти к заданию</button>
            </div>
          )}

          {currentSection === 'pair' && (
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                 <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm">2</span>
                 Этап 2: Практика (в паре)
              </h2>
              <p className="text-indigo-600 font-bold mb-6 italic">Ваш партнер: {String(assignments[currentUserLogin]?.partners || "Ожидание...")}</p>
              
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-indigo-50 mb-6">
                {assignments[currentUserLogin] ? (
                  <>
                    <h3 className="text-xl font-bold text-indigo-800 mb-2">{String(assignments[currentUserLogin].task.title)}</h3>
                    <p className="text-slate-600 mb-4">{String(assignments[currentUserLogin].task.goal)}</p>
                    <div className="bg-indigo-100 p-3 rounded-lg font-mono text-xs select-all text-indigo-800 break-all mb-6">{String(assignments[currentUserLogin].task.url)}</div>
                    
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-inner">
                      <p className="text-xs font-bold text-indigo-500 mb-3 uppercase tracking-wider">Подсказки для решения:</p>
                      <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4">
                        <li>Используйте функцию <code className="bg-slate-100 px-1 rounded">fetch()</code> для отправки запроса</li>
                        <li>Преобразуйте ответ в JSON через <code className="bg-slate-100 px-1 rounded">.then(res =&gt; res.json())</code></li>
                        <li>Выведите результат в консоль (F12)</li>
                      </ul>
                    </div>
                  </>
                ) : <p className="text-slate-400 italic">Группы еще не распределены преподавателем.</p>}
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-5 py-3 rounded-2xl text-xs font-bold border border-amber-100 shadow-sm">
                  <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span>Выполните код в консоли браузера и ПОКАЖИТЕ результат учителю!</span>
                </div>
                <button onClick={() => setCurrentSection('refactor')} disabled={!assignments[currentUserLogin]} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold disabled:bg-slate-200 shadow-lg hover:bg-indigo-700 transition">Я показал результат, идем дальше</button>
              </div>
            </div>
          )}

          {currentSection === 'refactor' && (
            <div className="space-y-6 animate-in fade-in duration-700">
               <div className="bg-white p-8 rounded-3xl shadow-xl border border-indigo-100">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-3xl font-black text-slate-900 mb-1">Этап 3: Побег из Callback Hell ⛓️</h2>
                      <p className="text-slate-500 text-sm">Очищаем код при помощи <span className="text-indigo-600 font-bold">Async/Await</span></p>
                    </div>
                    <a href="https://metanit.com/web/javascript/17.6.php" target="_blank" rel="noopener noreferrer" className="bg-orange-50 text-orange-700 px-4 py-2 rounded-xl text-[10px] font-black border border-orange-200 hover:bg-orange-600 hover:text-white transition flex items-center gap-2 uppercase tracking-tighter">
                      Справочник Metanit
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                      <h4 className="text-red-700 font-bold text-xs uppercase mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        Проблема: Callback Hell
                      </h4>
                      <pre className="text-[10px] font-mono text-red-800 bg-white/50 p-3 rounded-lg overflow-x-auto">
{`fetch(url)
  .then(response => {
    return response.json();
  })
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error(error);
  });`}
                      </pre>
                    </div>

                    <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                      <h4 className="text-emerald-700 font-bold text-xs uppercase mb-3 flex items-center gap-2">
                         <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                         Решение: Async/Await
                      </h4>
                      <div className="space-y-3">
                        <p className="text-[11px] text-emerald-800">Согласно <b>Metanit</b>, мы можем писать асинхронный код так, будто он синхронный:</p>
                        <ol className="text-[10px] text-emerald-900 space-y-1 list-decimal pl-4 font-medium">
                          <li>Поместите код внутрь <code className="bg-emerald-200 px-1 text-emerald-900 italic font-mono font-bold">async function</code>.</li>
                          <li>Используйте <code className="bg-emerald-200 px-1 text-emerald-900 italic font-mono font-bold">await</code> перед <code className="bg-emerald-100 px-1 italic">fetch()</code>.</li>
                          <li>Обязательно оберните всё в блок &nbsp;<code className="bg-emerald-200 px-1 text-emerald-900 italic font-mono font-bold">try &#123; ... &#125; catch(e) &#123; ... &#125;</code>.</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Ваше решение (Код должен включать async, await и try/catch):</label>
                    <textarea 
                      value={battleCode} 
                      onChange={(e) => setBattleCode(e.target.value)} 
                      className="w-full h-64 p-6 border-2 border-slate-100 rounded-3xl font-mono text-sm outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition bg-slate-900 text-indigo-300 shadow-inner" 
                      placeholder={`async function myFetch() {\n  try {\n    // твой код здесь...\n  } catch (error) {\n    // обработка ошибки...\n  }\n}`} 
                    />
                  </div>

                  {battleError && (
                    <div className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 text-rose-700 rounded-r-xl font-bold text-xs flex items-center gap-3">
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {String(battleError)}
                    </div>
                  )}

                  <button 
                    onClick={submitBattle} 
                    className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition transform active:scale-95 flex items-center justify-center gap-3 text-lg"
                  >
                    Завершить и сдать работу 🚀
                  </button>
               </div>
            </div>
          )}

          {currentSection === 'final' && (
            <div className="text-center p-12 bg-white rounded-3xl shadow-xl border border-slate-100">
              <div className="text-7xl mb-6">🏆</div>
              <h2 className="text-3xl font-bold mb-2 text-indigo-900">Завершено!</h2>
              <p className="text-slate-400 mb-8">Ваше решение сохранено в системе.</p>
              <div className="text-7xl font-black text-indigo-600 mb-4">
                {(Number(results[currentUserLogin]?.quiz) || 0) + (Number(results[currentUserLogin]?.pairScore) || 0) + (Number(results[currentUserLogin]?.codeScore) || 0)} <span className="text-2xl text-slate-300">/ 50</span>
              </div>
            </div>
          )}

          {currentSection === 'admin-view' && (
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <h2 className="text-2xl font-bold mb-6 text-indigo-900">Результаты группы</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-2">Студент</th>
                      <th className="py-3 px-2 text-center">Тест</th>
                      <th className="py-3 px-2 text-center">Код</th>
                      <th className="py-3 px-2 text-center">ИТОГО</th>
                      <th className="py-3 px-2 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ALLOWED_LOGINS.sort().map(login => {
                      const res = results[login] || {};
                      const total = (Number(res.quiz) || 0) + (Number(res.pairScore) || 0) + (Number(res.codeScore) || 0);
                      return (
                        <tr key={login} className="hover:bg-slate-50 transition group">
                          <td className="py-3 px-2 font-mono font-bold text-slate-700">{String(login)}</td>
                          <td className="py-3 px-2 text-center text-indigo-500 font-bold">{String(res.quiz || 0)}</td>
                          <td className="py-3 px-2 text-center">{res.codeText ? <span className="text-green-500">✅</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="py-3 px-2 font-black text-center text-indigo-900">{String(total)}</td>
                          <td className="py-3 px-2 text-right">
                            <button onClick={() => { setEvalTarget(login); setPScore(res.pairScore || 0); setCScore(res.codeScore || 0); }} className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-600 hover:text-white transition opacity-0 group-hover:opacity-100">Оценить</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {evalTarget && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
              <h3 className="text-2xl font-bold mb-4 text-indigo-900">{String(evalTarget)}</h3>
              <div className="bg-slate-900 text-green-400 p-6 rounded-2xl text-[10px] font-mono mb-6 h-56 overflow-y-auto border-4 border-slate-800 shadow-inner">
                {String(results[evalTarget]?.codeText || "// Решение еще не отправлено")}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Практика (0-10)</label>
                  <input type="number" value={pScore} onChange={(e) => setPScore(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-indigo-400 outline-none font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Битва (0-10)</label>
                  <input type="number" value={cScore} onChange={(e) => setCScore(e.target.value)} className="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-indigo-400 outline-none font-bold" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEvalTarget(null)} className="flex-1 py-4 border-2 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition uppercase text-xs">Отмена</button>
                <button onClick={saveEval} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition uppercase text-xs">Сохранить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}