import {Component} from 'react';

// Isolate optional editor failures. A broken motion/facial tool must not
// unmount the complete 3D studio or its functioning WebGL canvas.
export default class PanelErrorBoundary extends Component{
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    // Browser-local report only. Never send file contents, URLs or geometry.
    console.error('[ORBI] Error de panel '+(this.props.label||'3D')+':',
      error,info?.componentStack||'');
  }
  render(){
    const {error}=this.state;
    if(!error)return this.props.children;
    return <section className="panel-error-boundary" role="alert">
      <strong>No se pudo mostrar {this.props.label||'este panel'}.</strong>
      <p>El modelo 3D no se ha modificado. El resto del estudio continúa activo.</p>
      <code>{error?.message||'Error de interfaz desconocido'}</code>
      <button type="button" onClick={()=>this.setState({error:null})}>
        Reintentar panel
      </button>
    </section>;
  }
}
