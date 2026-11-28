import './App.css'
import { DashboardProvider } from '../shared/lib/DashboardContext'
import { LocaleProvider } from '../shared/lib/locale'
import { RetainBotPanel } from '../widgets/retainbot/RetainBotPanel'

export function App() {
  return (
    <LocaleProvider>
      <DashboardProvider>
        <RetainBotPanel />
      </DashboardProvider>
    </LocaleProvider>
  )
}

export default App
