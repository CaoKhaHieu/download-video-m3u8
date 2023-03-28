import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { openDB } from 'idb';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import muxjs from "mux.js";
import { Parser } from 'm3u8-parser';

function App() {
  const db = useRef();
  const [urlMp4, setUrlMp4] = useState('');
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const mediaSource = new MediaSource();
  const transmuxer = new muxjs.mp4.Transmuxer();
  const mime = 'video/mp4; codecs="mp4a.40.2,avc1.64001f"';
  const urlVideo = 'https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/playlist.m3u8';

  const segmentsDemo = [
    "https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/720/video_0000000.ts",
    "https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/720/video_0000001.ts",
    "https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/720/video_0000002.ts",
    "https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/720/video_0000003.ts",
    "https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/720/video_0000004.ts",
  ];

  const createDB = async () => {
    db.current = await openDB('download', 1, {
      upgrade(db, oldVersion, newVersion, transaction) {
        db.createObjectStore('video');
      }
    });
  };

  const saveToIDB = async (data) => {
    const tx = await db?.current?.transaction('video', 'readwrite');
    const store = tx?.objectStore('video');
    await store.add(data, '1');
    await tx.done;
  };

  const getData = async () => {
    const transaction = await db?.current?.transaction('video', 'readonly');
    const store = transaction?.objectStore('video');
    const video = await store?.get('1');
    return video || null;
  };

  const initPlayer = (url) => {
    if (urlMp4) {
      playerRef.current.dispose();
    }
    // playerRef.current?.dispose();
    const videoPlayer = videojs(videoRef.current, {
      controls: true,
      muted: true,
      textTrackSettings: true,
    });
    playerRef.current = videoPlayer;
  };

  useEffect(() => {
    initPlayer();

    (async () => {
      await createDB();
    })();

    (async () => {
      await createDB();
      const data = await getData();
      if (data) {
        const mergedArray = mergeListArrayBuffer([...data]);
        appendSegments(mergedArray)
      }
    })();
    const linkBlob = URL.createObjectURL(mediaSource);
    playerRef.current.src({
      src: linkBlob,
      type: 'video/mp4'
    });
  }, []);

  useEffect(() => {
    if(urlMp4) {
      initPlayer();
    }
  }, [urlMp4]);

  const fetchData = async (url) => {
    const response = await (await fetch(url)).arrayBuffer();
    return new Uint8Array(response);
  };

  const appendSegments = (data) => {
    // if (segments.length == 0){
    //   mediaSource.endOfStream();
    //   return;
    // }

    URL.revokeObjectURL(videoRef.current.src);
    
    const sourceBuffer = mediaSource.addSourceBuffer(mime);
    sourceBuffer.addEventListener('updateend', () => {
      mediaSource.endOfStream();
    });

    transmuxer.off('data');
    transmuxer.on('data', (segment) => {
      let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
      data.set(segment.initSegment, 0);
      data.set(segment.data, segment.initSegment.byteLength);
      sourceBuffer.appendBuffer(data);
    })

    transmuxer.push(new Uint8Array(data));
    transmuxer.flush();
  }

  const fetchTSFiles = async (url) => {
    const listm3u8 = await fetchM3u8(url);
    const content =  await (await fetch(listm3u8)).text();
    const lines = content.split('\n');
    const listTs = [...lines].filter(item => item.includes('.ts'));
    const isPlaylist = isM3U8Playlist(url);

    const compileAllTs = [...listTs].map((item, index) => {
      if (!isPlaylist) {
        return listm3u8.replace(/(.mp4)\.m3u8/, `$1-${index}.ts`);
      } else {
        return listm3u8.replace(/\/\d+p\.m3u8$/, '/' + item);
      }
    })

    const mappingFetchTs = compileAllTs?.map((segment) => fetchData(segment));
    const data = await Promise.all(mappingFetchTs);
    return data;
  };

  const mergeListArrayBuffer = (myArrays) => {
    let length = 0;
    myArrays.forEach(item => {
      length += item.length;
    });

    let mergedArray = new Uint8Array(length);
    let offset = 0;
    myArrays.forEach(item => {
      mergedArray.set(item, offset);
      offset += item.length;
    });

    return mergedArray;
  };

  const fetchM3u8 = async (url) => {
    const m3u8Content = await (await fetch(url)).text();
    const lines = m3u8Content.split('\n');
    const segmentUrls = [];
    for (let line of lines) {
      if(line.startsWith("http")){
        segmentUrls.push(line);
      }
    }

    if (segmentUrls.length) {
      return segmentUrls[0];
    } else {
      // check chunklist
      const chunklist = lines.filter(item => item.includes('.m3u8'));
      let newUrl = url.replace('/playlist.m3u8', `/${chunklist[0]}`);
      return newUrl;
    }
  };

  const isM3U8Playlist = (url) => {
    return url.endsWith('/playlist.m3u8');
  };

  const handleDownload = async () => {
    const data = await fetchTSFiles(urlVideo);
    await saveToIDB(data);
    alert('Download xong. Reload lại đi.');
  };

  return (
    <div className="App">
      <div style={{margin: '50px'}}>
        <p>Url Video: {urlVideo}</p>
        <button onClick={handleDownload}>Click to download</button>
      </div>
      <div className='list-video'>
        <video
          width={900}
          height={500}
          ref={videoRef}
          id='video-js'
          className="video-js"
        >
        </video>
      </div>
    </div>
  );
}

export default App;
