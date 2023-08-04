import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { openDB } from 'idb';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import muxjs from "mux.js";

// const videoDummy1 = {
//   url: "https://media.cdn.lunativi.com/vods/2/9n37JknPsWVWe2YX4yzuhYPMsXas7emp4/playlist.m3u8",
//   id: 1,
// }

function App() {
  const db = useRef();
  const [urlMp4, setUrlMp4] = useState('');
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  let totalSegments = 0;
  const arr = useRef([]);
  const isPaused = useRef(false);
  
  const currentSegmentIndex = useRef(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [progress, setProgress] = useState(0);

  const mediaSource = new MediaSource();
  const transmuxer = new muxjs.mp4.Transmuxer();
  const mime = 'video/mp4; codecs="mp4a.40.2,avc1.64001f"';
  const urlVideo = 'https://vod.dev2.lunativi.com/vods/4/yCbm6ZXk9kucNJfGzOo0_MEDIA_20230322-093606_1679452566475_LUPIYmp4/playlist.m3u8';
  // const urlVideo = "https://upload-stg.cdn.luna.netcoresolutions.net/vods/4/kfwR6oS6PF89NLdKPNQl_MEDIA_20230424-094148_1682304108983_2U7yLmp4/playlist.m3u8";
  // const urlVideo = "https://media.cdn.lunativi.com/vods/2/NmkLNc90CpAKoY7dgxGlpTnIKvwzSamp4/playlist.m3u8";
  // const urlVideo = "https://media.cdn.lunativi.com/vods/2/siOzjuHivCFryckPS7cIXxXWia8XUCmp4/playlist.m3u8";
  // const urlVideo = "https://media.cdn.lunativi.com/vods/2/9n37JknPsWVWe2YX4yzuhYPMsXas7emp4/playlist.m3u8";
  // const urlVideo = "https://media.cdn.lunativi.com/vods/2/54xD5fYRgf77iTbLWZJa_MEDIA_20230425-233523_1682480123929_dgNdgmp4/playlist.m3u8";

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

  const updateIDB = async (data) => {
    try {
      const tx = await db?.current?.transaction('video', 'readwrite');
      const store = tx?.objectStore('video');

      await store.put(data, '1');
  
      await tx.done;
    } catch (error) {
      console.error('Error saving data to IndexedDB:', error);
    }
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
      autoplay: true,
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
        arr.current = data;
        currentSegmentIndex.current = data.length;
        if (currentSegmentIndex.current < +(localStorage.getItem('TOTAL_SEGMENTS') || 0)) {
          fetchTSFiles(urlVideo);
        }
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
    if (isPaused.current) {
      return
    }
    const responseFetch = await fetch(url);
    if (responseFetch) {
      const responseUnit8Array = await responseFetch.arrayBuffer().catch(err => {
        return []
      })
      arr.current.push(new Uint8Array(responseUnit8Array));
      const newArr = [...arr.current];
      arr.current = newArr;

      await updateIDB(newArr);
      currentSegmentIndex.current = currentSegmentIndex.current + 1;
      setProgress(Math.floor((currentSegmentIndex.current / totalSegments) * 100));
      // localStorage.setItem('INDEX_SEGMENT_DOWNLOADING', currentSegmentIndex.current);
    }
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
    totalSegments = compileAllTs.length;
    localStorage.setItem('TOTAL_SEGMENTS', compileAllTs.length);

    if (currentSegmentIndex.current > 0) {
      compileAllTs.splice(0, currentSegmentIndex.current);
    }

    for (const url of compileAllTs) {
      try {
        await fetchData(url);
      } catch (error) {
        console.error(`Error fetching URL: ${url}`, error);
      }
    }

    // updateIDB(arr);
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
    setIsDownloaded(true);
    // await saveToIDB(data);
  };

  const pauseDownload = () => {
    isPaused.current = true;
    console.log('pausee ---------------')
  };

  const resumeDownload = async () => {
    console.log('resumeDownload')
    isPaused.current = false;
    const data = await fetchTSFiles(urlVideo);
    // alert('Download xong. Reload lại đi.');
  };

  const cancelDownload = async () => {
    isPaused.current = true;
    const transaction = await db?.current?.transaction('video', 'readwrite');
    const store = await transaction?.objectStore('video');
    await store.delete('1');
    alert('delete video, please reload')
  };

  return (
    <div className="App">
      <div style={{margin: '50px', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
        <p>Url Video: {urlVideo}</p>
        <p>Downloading: {progress} %</p>
        <div>
          <button onClick={handleDownload}>Click to download</button>
          <button onClick={pauseDownload}>Pause Download</button>
          <button onClick={resumeDownload}>Resume Download</button>
          {isDownloaded && progress === 100 && <b>Video Downloaded, please reload web</b>}
          <button onClick={cancelDownload}>Cancel Download</button>
        </div>
      </div>
      <p>Note: Download video to play</p>
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
