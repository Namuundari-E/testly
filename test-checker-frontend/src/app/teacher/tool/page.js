import { Suspense } from 'react'
import RegionMarkerTool from './RegionMarkerTool' //  current component

export default function ToolPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegionMarkerTool />
    </Suspense>
  )
}