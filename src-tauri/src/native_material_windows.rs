//! Official Windows Composition host-backdrop brush, clipped inside one HWND.
//! Requires Windows 11's DWMWA_USE_HOSTBACKDROPBRUSH. No whole-window Acrylic,
//! extra HWND, polling thread, or screenshot capture is used.
use super::{Surface, NEXUS_POINTS};
use std::cell::RefCell;
use windows::{
    core::{implement, Interface, Ref, Result},
    Graphics::{IGeometrySource2D, IGeometrySource2D_Impl},
    System::{DispatcherQueue, DispatcherQueueController},
    Win32::{
        Foundation::HWND,
        Graphics::{
            Direct2D::{
                Common::{D2D1_FIGURE_BEGIN_FILLED, D2D1_FIGURE_END_CLOSED},
                D2D1CreateFactory, ID2D1Factory, ID2D1Geometry, D2D1_FACTORY_TYPE_SINGLE_THREADED,
            },
            Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH},
        },
        System::WinRT::{
            Composition::ICompositorDesktopInterop,
            CreateDispatcherQueueController, DispatcherQueueOptions,
            Graphics::Direct2D::{IGeometrySource2DInterop, IGeometrySource2DInterop_Impl},
            DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
        },
    },
    UI::{
        Composition::{
            CompositionClip, CompositionGeometry, CompositionPath, Compositor,
            Desktop::DesktopWindowTarget, SpriteVisual,
        },
        ViewManagement::UISettings,
    },
};
use windows_numerics::{Vector2, Vector3};

#[implement(IGeometrySource2D, IGeometrySource2DInterop)]
struct GeometrySource(ID2D1Geometry);
impl IGeometrySource2D_Impl for GeometrySource_Impl {}
#[allow(non_snake_case)]
impl IGeometrySource2DInterop_Impl for GeometrySource_Impl {
    fn GetGeometry(&self) -> Result<ID2D1Geometry> {
        Ok(self.0.clone())
    }
    fn TryGetGeometryUsingFactory(&self, _: Ref<'_, ID2D1Factory>) -> Result<ID2D1Geometry> {
        Ok(self.0.clone())
    }
}

struct Material {
    compositor: Compositor,
    visual: SpriteVisual,
    _target: DesktopWindowTarget,
    _queue: Option<DispatcherQueueController>,
}

thread_local! { static MATERIAL: RefCell<Option<Material>> = const { RefCell::new(None) }; }

impl Material {
    fn new(hwnd: HWND) -> Result<Self> {
        let queue = if DispatcherQueue::GetForCurrentThread().is_err() {
            Some(unsafe {
                CreateDispatcherQueueController(DispatcherQueueOptions {
                    dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                    threadType: DQTYPE_THREAD_CURRENT,
                    apartmentType: DQTAT_COM_NONE,
                })?
            })
        } else {
            None
        };
        let enabled: i32 = 1;
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_HOSTBACKDROPBRUSH,
                (&enabled as *const i32).cast(),
                4,
            )?;
        }
        let compositor = Compositor::new()?;
        let interop: ICompositorDesktopInterop = compositor.cast()?;
        // Under the existing transparent WebView, within the same widget HWND.
        let target = unsafe { interop.CreateDesktopWindowTarget(hwnd, false)? };
        let visual = compositor.CreateSpriteVisual()?;
        visual.SetBrush(&compositor.CreateHostBackdropBrush()?)?;
        visual.SetIsVisible(false)?;
        target.SetRoot(&visual)?;
        Ok(Self {
            compositor,
            visual,
            _target: target,
            _queue: queue,
        })
    }

    fn update(&self, surface: Option<Surface>, scale: f64) -> Result<()> {
        self.visual.SetIsVisible(false)?;
        self.visual.SetClip(None::<&CompositionClip>)?;
        let Some(s) = surface else {
            return Ok(());
        };
        // Keep CSS transparency instead of presenting a solid fallback panel.
        if !UISettings::new()?.AdvancedEffectsEnabled()? {
            return Ok(());
        }
        let geometry: CompositionGeometry = if s.radius > 0. {
            let rect = self.compositor.CreateRoundedRectangleGeometry()?;
            rect.SetSize(Vector2 {
                X: s.width as f32,
                Y: s.height as f32,
            })?;
            rect.SetCornerRadius(Vector2 {
                X: s.radius as f32,
                Y: s.radius as f32,
            })?;
            rect.cast()?
        } else {
            let factory: ID2D1Factory =
                unsafe { D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)? };
            let path = unsafe { factory.CreatePathGeometry()? };
            let sink = unsafe { path.Open()? };
            let points: Vec<_> = NEXUS_POINTS
                .iter()
                .map(|&(x, y)| Vector2 {
                    X: x as f32,
                    Y: y as f32,
                })
                .collect();
            unsafe {
                sink.BeginFigure(points[0], D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLines(&points[1..]);
                sink.EndFigure(D2D1_FIGURE_END_CLOSED);
                sink.Close()?;
            }
            let source: IGeometrySource2D = GeometrySource(path.cast()?).into();
            self.compositor
                .CreatePathGeometryWithPath(&CompositionPath::Create(&source)?)?
                .cast()?
        };
        self.visual
            .SetClip(&self.compositor.CreateGeometricClipWithGeometry(&geometry)?)?;
        self.visual.SetSize(Vector2 {
            X: s.width as f32,
            Y: s.height as f32,
        })?;
        self.visual.SetScale(Vector3 {
            X: scale as f32,
            Y: scale as f32,
            Z: 1.,
        })?;
        self.visual.SetOffset(Vector3 {
            X: (s.x * scale) as f32,
            Y: (s.y * scale) as f32,
            Z: 0.,
        })?;
        self.visual.SetIsVisible(true)
    }
}

pub fn sync(hwnd: HWND, surface: Option<Surface>, scale: f64) -> Result<()> {
    MATERIAL.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() && surface.is_some() {
            *slot = Some(Material::new(hwnd)?);
        }
        if let Some(material) = slot.as_ref() {
            material.update(surface, scale)?;
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::{
        core::w,
        Win32::{
            System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_SINGLETHREADED},
            UI::WindowsAndMessaging::{CreateWindowExW, DestroyWindow, WINDOW_EX_STYLE, WS_POPUP},
        },
    };

    #[test]
    #[ignore = "Requires an interactive Windows 11 session with desktop composition"]
    fn native_host_backdrop_accepts_shapes_and_clears() {
        unsafe {
            RoInitialize(RO_INIT_SINGLETHREADED).unwrap();
        }
        let hwnd = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                w!("Quota material test"),
                WS_POPUP,
                0,
                0,
                740,
                740,
                None,
                None,
                None,
                None,
            )
            .unwrap()
        };
        let material = Material::new(hwnd).expect("create host backdrop in the existing HWND");
        assert!(
            UISettings::new().unwrap().AdvancedEffectsEnabled().unwrap(),
            "enable Windows transparency for this test"
        );
        for scale in [1., 1.25, 1.5, 2.] {
            for (skin, expanded) in [("glass", false), ("glass", true), ("nexus", true)] {
                let s = super::super::surface(skin, expanded);
                material.update(s, scale).expect("apply native shape");
                assert!(material.visual.IsVisible().unwrap());
                assert!(material.visual.Clip().is_ok());
            }
        }
        material.update(None, 1.).unwrap();
        assert!(!material.visual.IsVisible().unwrap());
        assert!(material.visual.Clip().is_err());
        drop(material);
        unsafe {
            DestroyWindow(hwnd).unwrap();
            RoUninitialize();
        }
    }
}
