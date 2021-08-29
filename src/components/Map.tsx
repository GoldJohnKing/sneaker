import { getDistance, getGreatCircleBearing } from "geolib";
import { divIcon, LatLng, LatLngExpression } from "leaflet";
import React, { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMapEvent,
} from "react-leaflet";
import { Syria } from "../dcs/maps/Syria";
import { useKeyPress } from "../hooks/useKeyPress";
import { ObjectMetadata, serverStore } from "../stores/ServerStore";
import { computeBRAA } from "../util";
import { MapIcon } from "./MapIcon";

export function MapObject(
  { obj, active, setActive, zoom }: {
    obj: ObjectMetadata;
    active: boolean;
    setActive: () => void;
    zoom: number;
  },
) {
  const position: LatLngExpression = [obj.latitude, obj.longitude];

  if (
    obj.types.includes("Ground") ||
    obj.types.length == 0
  ) {
    return <></>;
  }

  const icon = useMemo(() =>
    divIcon({
      html: renderToStaticMarkup(
        <div className="flex flex-row absolute w-64">
          <MapIcon
            obj={obj}
            className="relative bg-opacity-70"
          />
          <div
            className="bg-gray-700 bg-opacity-40 flex flex-col absolute"
            style={{ left: 24, top: -6 }}
          >
            {obj.types.includes("Air") &&
              (
                <div className="flex flex-col">
                  <div className="font-bold text-white">
                    {obj.name}
                    {!obj.pilot.startsWith(obj.group)
                      ? <>{" -"} {obj.pilot}</>
                      : null}
                  </div>
                  <div className="text-pink-300">
                    {Math.floor(
                      (obj.altitude * 3.28084) / 1000,
                    )}
                  </div>
                </div>
              )}
            <div>
              {active &&
                (
                  <span className="text-gray-100">
                    {JSON.stringify(obj)}
                  </span>
                )}
            </div>
          </div>
        </div>,
      ),
      className: "",
    }), [obj.name, obj.group, obj.pilot, active, zoom]);

  const dirArrowEnd = computeBRAA(
    position[0],
    position[1],
    obj.heading,
    30000 - (zoom * 2000),
  );

  return (
    <>
      {obj.types.includes("Air") && (
        <Polyline
          positions={[
            position,
            dirArrowEnd,
          ]}
          pathOptions={{ color: "white", weight: 1 }}
        />
      )}
      <Marker
        position={position}
        icon={icon}
        eventHandlers={{
          click: () => {
            setActive();
          },
        }}
        zIndexOffset={0}
      />
    </>
  );
}

function MapObjects() {
  const objects = serverStore((state) =>
    state.objects.valueSeq().filter((k) =>
      (!k.types.includes("Bullseye") || k.coalition !== "Allies") &&
      !k.types.includes("Parachutist")
    )
  );
  const [activeObjectId, setActiveObjectId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(9);
  const zoomEvent = useMapEvent("zoom", () => {
    setZoom(zoomEvent.getZoom());
  });

  const [braaStartPos, setBraaStartPos] = useState<number | LatLng | null>(
    null,
  );
  const [cursorPos, setCursorPos] = useState<number | LatLng | null>(null);
  const isSnapDown = useKeyPress("s");

  useMapEvent("contextmenu", (e) => {});

  useMapEvent("mousemove", (e) => {
    let snappedObject = null;
    if (isSnapDown) {
      snappedObject = objects.map((
        obj,
      ) =>
        [
          obj.id,
          getDistance([obj.latitude, obj.longitude], [
            e.latlng.lat,
            e.latlng.lng,
          ]),
        ] as [number, number]
      ).sort((a, b) => a[1] - b[1]).first();
    }

    if (snappedObject) {
      setCursorPos(
        snappedObject[0],
      );
    } else {
      setCursorPos(e.latlng);
    }
  });

  const mouseDownEvent = useMapEvent("mousedown", (e) => {
    if (e.originalEvent.button === 2) {
      if (isSnapDown) {
        const snappedObject = objects.sort((
          a,
          b,
        ) =>
          getDistance([a.latitude, a.longitude], [
            e.latlng.lat,
            e.latlng.lng,
          ]) - getDistance([b.latitude, b.longitude], [
            e.latlng.lat,
            e.latlng.lng,
          ])
        ).first();
        if (snappedObject) {
          setBraaStartPos(snappedObject.id);
        }
      } else {
        setBraaStartPos(e.latlng);
      }
      mouseUpEvent.dragging.disable();
    }
  });

  const braaObj = typeof braaStartPos === "number" &&
    serverStore.getState().objects.get(braaStartPos);
  let braaPos: LatLngExpression | undefined = undefined;
  if (typeof braaStartPos === "number" && braaObj) {
    braaPos = [braaObj.latitude, braaObj.longitude];
  } else if (braaStartPos) {
    braaPos = braaStartPos as LatLng;
  }

  const cursorObj = typeof cursorPos === "number" &&
    serverStore.getState().objects.get(cursorPos);
  let ourCursorPos: LatLngExpression | undefined = undefined;
  if (typeof cursorPos === "number" && cursorObj) {
    ourCursorPos = [cursorObj.latitude, cursorObj.longitude];
  } else if (cursorPos) {
    ourCursorPos = cursorPos as LatLng;
  }

  const mouseUpEvent = useMapEvent("mouseup", (e) => {
    if (e.originalEvent.button === 2) {
      mouseDownEvent.dragging.enable();
    }
    if (braaStartPos) {
      setBraaStartPos(null);
    }
  });

  const icon = useMemo(() => {
    if (!braaPos || !ourCursorPos) {
      return null;
    }

    return divIcon({
      html: renderToStaticMarkup(
        <div
          className="absolute text-indigo-300 ml-10 text-xl whitespace-nowrap bg-gray-600 p-2"
        >
          {Math.floor(getGreatCircleBearing(braaPos, ourCursorPos)) +
            Syria.magDec} / {Math.floor(
              getDistance(braaPos, ourCursorPos) * 0.00053995680345572,
            )}NM
        </div>,
      ),
      className: "",
    });
  }, [braaPos, ourCursorPos, objects]);

  return (
    <>
      {objects.map((obj) => (
        <MapObject
          key={obj.id}
          obj={obj}
          active={obj.id === activeObjectId}
          setActive={() =>
            activeObjectId === obj.id
              ? setActiveObjectId(null)
              : setActiveObjectId(obj.id)}
          zoom={zoom}
        />
      ))}
      {braaPos && ourCursorPos && (
        <>
          <Polyline
            positions={[
              ourCursorPos,
              braaPos,
            ]}
            pathOptions={{
              weight: 2,
              color: "yellow",
            }}
          />
          {icon && (
            <Marker
              position={ourCursorPos}
              icon={icon}
              zIndexOffset={30}
            />
          )}
        </>
      )}
    </>
  );
}

export default function Map(): JSX.Element {
  return (
    <MapContainer
      doubleClickZoom={false}
      center={Syria.center as LatLngExpression}
      zoom={9}
      minZoom={8}
      maxZoom={12}
      scrollWheelZoom={true}
      className="h-full w-full relative"
    >
      <TileLayer
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
      />
      <MapObjects />
    </MapContainer>
  );
}
