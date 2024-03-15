<template>
  <div id="app">
    <div id="nav">
      <router-link to="/">Home</router-link> |
      <router-link to="/about">About</router-link>
      <!-- 测试子应用可以正常监听window使用window.scrollTo -->
      <button @click="srcollToTest">测试scrollTo滚动</button>
    </div>
    <router-view/>
  </div>
</template>

<script>
  export default {
    methods: {
      srcollToTest: () => {
        window.scrollTo({ top: 3000 });
      },
      srcollIntoViewTest: () => {
        //
      }
  },
}
</script>
<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

#nav {
  padding: 30px;
}

#nav a {
  font-weight: bold;
  color: #2c3e50;
}

#nav a.router-link-exact-active {
  color: #42b983;
}
</style>
